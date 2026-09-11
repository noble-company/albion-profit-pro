"""Task 4/23 — histórico da API pública em `market_history_entry`.

O nosso client só captura histórico quando o jogador abre o gráfico do item: 208 itens com
histórico de 6 h no banco. A API pública tem 30 dias em blocos de 6 h para todo item que alguém
negociou — e os blocos caem nas mesmas 00/06/12/18 UTC dos nossos, então as duas fontes dividem a
mesma linha por bloco.

Nenhum teste bate na API de verdade: tudo passa por `httpx.MockTransport` ou por um fake.
"""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.cache.redis_client import get_redis, new_redis_client
from src.database import async_session_maker, engine
from src.ingest.normalize import TICKS_PER_SECOND, TICKS_UNIX_EPOCH
from src.ingest.service import save_market_history
from src.items.models import Item
from src.prices import aodp
from src.prices import tasks as prices_tasks
from src.prices.history import upsert_history_aodp
from src.prices.models import MarketHistoryDaily, MarketHistoryEntry
from src.prices.snapshot import SOURCE_AODP, SOURCE_CLIENT
from src.recipes.models import Recipe

ONTEM = (datetime.now(UTC) - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
ALBION = {"T4_LEATHER": 910_101, "T4_PLANKS": 910_102}


def _ponto(inicio: datetime, unidades: int = 10, preco: int = 365) -> dict:
    # A API devolve o timestamp sem fuso, em UTC.
    return {
        "item_count": unidades,
        "avg_price": preco,
        "timestamp": inicio.replace(tzinfo=None).isoformat(),
    }


def _serie(item_id="T4_LEATHER", location="Lymhurst", quality=1, pontos=None) -> dict:
    return {
        "location": location,
        "item_id": item_id,
        "quality": quality,
        "data": pontos if pontos is not None else [_ponto(ONTEM)],
    }


# --- Conversão ---


def test_serie_vira_bloco_de_6h_com_fonte_aodp():
    [linha] = aodp.to_history_rows([_serie()], ALBION)

    assert linha == {
        "item_id": 910_101,
        "location_id": "1002",
        "quality_level": 1,
        "bucket_seconds": 21600,
        "bucket_start": ONTEM,
        "item_amount": 10,
        # A API dá o preço médio arredondado; o total do bloco é unidades × média.
        "silver_amount": Decimal("3650"),
        "source": SOURCE_AODP,
    }


def test_item_sem_albion_id_e_cidade_fora_do_mapa_sao_ignorados():
    """A chave do histórico é o `albion_id`. Sem ele não há onde gravar — e cidade fora do mapa
    viraria um `location_id` inventado."""
    linhas = aodp.to_history_rows(
        [_serie(item_id="T4_SEM_ID"), _serie(location="Cidade Que Nao Existe")], ALBION
    )
    assert linhas == []


def test_ponto_repetido_na_resposta_nao_quebra_o_upsert():
    """O Postgres recusa `ON CONFLICT` batendo na mesma linha duas vezes no mesmo INSERT."""
    serie = _serie(pontos=[_ponto(ONTEM, 10), _ponto(ONTEM, 12)])
    linhas = aodp.to_history_rows([serie], ALBION)

    assert len(linhas) == 1
    assert linhas[0]["item_amount"] == 12


async def test_pedido_e_sempre_de_blocos_de_6h_nunca_a_serie_diaria():
    """A série diária da API fecha o dia às 06:00 UTC; o nosso fecha à meia-noite. Gravar a
    diária desalinharia o rollup. O pedido é sempre `time-scale=6`, e só a partir de `since`."""
    capturado = {}

    def handler(request: httpx.Request) -> httpx.Response:
        capturado["url"] = request.url
        return httpx.Response(200, json=[_serie()])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        series = await aodp.fetch_history(
            client, "https://west.exemplo", ["T4_LEATHER", "T4_PLANKS"], date(2026, 9, 8)
        )

    url = capturado["url"]
    assert f"{aodp.HISTORY_PATH}T4_LEATHER,T4_PLANKS.json" in url.path
    assert url.params["time-scale"] == "6"
    assert url.params["date"] == "2026-09-08"
    assert "Lymhurst" in url.params["locations"]
    assert series[0]["item_id"] == "T4_LEATHER"


# --- Precedência: o client vence ---


def _payload_do_client(albion_id: int, unidades: int, prata: int, inicio: datetime = ONTEM) -> dict:
    ticks = int(inicio.timestamp()) * TICKS_PER_SECOND + TICKS_UNIX_EPOCH
    return {
        "albion_id": albion_id,
        "location_id": "1002",
        "quality_level": 1,
        "timescale": 1,  # 6 h
        # Prata do wire vem multiplicada por 10.000.
        "histories": [
            {"timestamp": ticks, "item_amount": unidades, "silver_amount": prata * 10_000}
        ],
    }


async def _item(db_session, nome="T4_LEATHER"):
    db_session.add(Item(unique_name=nome, albion_id=ALBION[nome], busca_normalizada=nome.lower()))
    await db_session.commit()


async def _entrada(db_session) -> MarketHistoryEntry:
    return (
        await db_session.scalars(
            select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == ALBION["T4_LEATHER"])
        )
    ).one()


async def test_api_publica_grava_bloco_novo_com_fonte_aodp(db_session):
    await upsert_history_aodp(db_session, "west", aodp.to_history_rows([_serie()], ALBION))
    await db_session.commit()

    entrada = await _entrada(db_session)
    assert (entrada.item_amount, entrada.source) == (10, SOURCE_AODP)


async def test_api_publica_nao_sobrescreve_bloco_do_client(db_session):
    """O dado do client vem direto do servidor do jogo, com a prata exata; o da API é agregado e
    arredondado. No mesmo bloco, o client vence."""
    await _item(db_session)
    await save_market_history(
        async_session_maker,
        get_redis(),
        _payload_do_client(ALBION["T4_LEATHER"], 50, 15000),
        "west",
    )

    await upsert_history_aodp(db_session, "west", aodp.to_history_rows([_serie()], ALBION))
    await db_session.commit()

    entrada = await _entrada(db_session)
    assert (entrada.item_amount, entrada.silver_amount, entrada.source) == (
        50,
        Decimal("15000"),
        SOURCE_CLIENT,
    )


async def test_client_sobrescreve_bloco_da_api_publica(db_session):
    await _item(db_session)
    await upsert_history_aodp(db_session, "west", aodp.to_history_rows([_serie()], ALBION))
    await db_session.commit()

    await save_market_history(
        async_session_maker,
        get_redis(),
        _payload_do_client(ALBION["T4_LEATHER"], 50, 15000),
        "west",
    )

    db_session.expire_all()
    entrada = await _entrada(db_session)
    assert (entrada.item_amount, entrada.source) == (50, SOURCE_CLIENT)


async def test_rollup_soma_as_duas_fontes_sem_contar_duas_vezes(db_session):
    """Uma linha por bloco: onde as duas fontes cobrem o mesmo bloco, só o client fica."""
    await _item(db_session)
    seis = ONTEM + timedelta(hours=6)
    doze = ONTEM + timedelta(hours=12)

    # API: 00h e 06h, 10 unidades cada.
    serie = _serie(pontos=[_ponto(ONTEM, 10), _ponto(seis, 10)])
    await upsert_history_aodp(db_session, "west", aodp.to_history_rows([serie], ALBION))
    await db_session.commit()
    # Client: 06h (vence a API) com 50, e 12h com 30.
    for inicio, unidades in ((seis, 50), (doze, 30)):
        await save_market_history(
            async_session_maker,
            get_redis(),
            _payload_do_client(ALBION["T4_LEATHER"], unidades, unidades * 300, inicio),
            "west",
        )

    await prices_tasks._rollup_diario(async_session_maker)

    diario = (
        await db_session.scalars(
            select(MarketHistoryDaily).where(MarketHistoryDaily.item_id == ALBION["T4_LEATHER"])
        )
    ).one()
    assert diario.item_amount == 10 + 50 + 30


# --- A varredura: fatias, falha isolada, 6 h entre varreduras ---


async def test_varredura_em_fatias_isola_falha_e_espera_6h(db_session, monkeypatch):
    nomes = ["T4_A", "T4_B", "T4_C", "T4_D", "T4_E"]
    db_session.add_all(
        [
            Item(unique_name=nome, albion_id=920_000 + i, busca_normalizada=nome.lower())
            for i, nome in enumerate(nomes)
        ]
        + [Recipe(output_item_unique_name=nome, production_kind="crafting") for nome in nomes]
    )
    await db_session.commit()

    # Um item por lote e três lotes por execução, para as fatias ficarem observáveis.
    monkeypatch.setattr(prices_tasks, "AODP_HISTORY_LOTE", 1)
    monkeypatch.setattr(prices_tasks, "AODP_HISTORY_LOTES_POR_EXECUCAO", 3)

    chamadas: list[tuple[str, date]] = []

    async def fake_fetch(client, base_url, items, since, cities=aodp.DEFAULT_CITIES):
        chamadas.append((items[0], since))
        if items[0] == "T4_B":
            raise httpx.ConnectError("indisponível")
        return [_serie(item_id=items[0])]

    monkeypatch.setattr(aodp, "fetch_history", fake_fetch)

    redis = new_redis_client()
    await redis.delete(prices_tasks.chave_do_historico("west"))
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    agora = datetime(2026, 9, 11, 3, 0, tzinfo=UTC)

    try:
        primeira = await prices_tasks._sync_aodp_history_realm(sessionmaker, redis, "west", agora)
        assert (primeira["status"], primeira["lotes_com_falha"]) == ("continuando", 1)
        assert [item for item, _ in chamadas] == ["T4_A", "T4_B", "T4_C"]
        # A primeira varredura traz os 30 dias.
        assert {since for _, since in chamadas} == {date(2026, 8, 12)}

        segunda = await prices_tasks._sync_aodp_history_realm(
            sessionmaker, redis, "west", agora + timedelta(minutes=10)
        )
        assert segunda["status"] == "concluida"
        assert [item for item, _ in chamadas[3:]] == ["T4_D", "T4_E"]
        assert chamadas[-1][1] == date(2026, 8, 12)  # a mesma varredura, o mesmo `since`

        antes = len(chamadas)
        terceira = await prices_tasks._sync_aodp_history_realm(
            sessionmaker, redis, "west", agora + timedelta(hours=1)
        )
        assert terceira["status"] == "aguardando"
        assert len(chamadas) == antes, "o histórico só muda a cada 6 h"

        depois = agora + timedelta(hours=6, minutes=1)
        quarta = await prices_tasks._sync_aodp_history_realm(sessionmaker, redis, "west", depois)
        assert quarta["status"] == "continuando"
        # As seguintes trazem só os últimos 3 dias.
        assert chamadas[-1][1] == (depois - timedelta(days=3)).date()
    finally:
        await redis.delete(prices_tasks.chave_do_historico("west"))
        await redis.aclose()

    gravados = {
        e.item_id
        for e in (await db_session.scalars(select(MarketHistoryEntry))).all()
        if e.source == SOURCE_AODP
    }
    assert gravados == {920_000, 920_002, 920_003, 920_004}  # o B falhou; os outros gravaram
