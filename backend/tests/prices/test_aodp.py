"""Task 4/04 — poller da API pública (AODP).

Nenhum teste bate na API de verdade: tudo passa por `httpx.MockTransport`. O que se prova aqui
é o que dá errado em produção — lote grande demais, zero confundido com ausência, cidade fora
do mapa, e um lote que falha levando os outros junto.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.parse import quote

import httpx
import pytest
from sqlalchemy import select

from src.prices import aodp
from src.prices.models import PriceSnapshot
from src.prices.snapshot import SOURCE_AODP, SOURCE_CLIENT, upsert_snapshot

AGORA = datetime.now(UTC)


# --- Lotes: o teto de 4096 chars da URL ---


def test_build_batches_nunca_estoura_o_teto_da_url():
    """Estourar 4.096 chars não devolve erro claro: devolve 414 ou resposta truncada, e a gente
    descobriria em produção."""
    itens = [
        f"T{t}_ITEM_COM_NOME_RAZOAVELMENTE_LONGO_{i}@3" for t in range(2, 9) for i in range(90)
    ]
    base = aodp.base_url_for("west")

    lotes = aodp.build_batches(itens, base_url=base)

    assert lotes, "deveria produzir ao menos um lote"
    for lote in lotes:
        url = (
            f"{base}{aodp.PRICES_PATH}{','.join(lote)}.json"
            f"?locations={quote(','.join(aodp.DEFAULT_CITIES))}&qualities=1"
        )
        assert len(url) <= aodp.URL_MAX_CHARS, f"URL com {len(url)} chars"


def test_build_batches_cobre_todos_os_itens_sem_repetir():
    itens = [f"T4_ITEM_{i}" for i in range(1000)]
    lotes = aodp.build_batches(itens, base_url=aodp.base_url_for("west"))

    achatado = [item for lote in lotes for item in lote]
    assert achatado == itens  # ordem preservada, nada perdido, nada duplicado


def test_item_unico_gigante_nao_entra_em_loop_infinito():
    lotes = aodp.build_batches(["T4_" + "X" * 5000], base_url=aodp.base_url_for("west"))
    assert len(lotes) == 1  # não cabe, mas não trava — quem falha é o request, com erro claro


# --- Conversão: zero não é ausência ---


def _entry(**overrides) -> dict:
    base = {
        "item_id": "T4_FIBER",
        "city": "Lymhurst",
        "quality": 1,
        "sell_price_min": 130,
        "sell_price_min_date": "2026-09-07T21:00:00",
        "buy_price_max": 107,
        "buy_price_max_date": "2026-09-07T19:10:00",
    }
    base.update(overrides)
    return base


def test_zero_da_api_vira_none_nunca_decimal_zero():
    """A API usa `0` para "não tenho preço". Gravar zero violaria o check de positividade e,
    pior, afirmaria que o item não vale nada — que é o oposto de "não sei quanto vale"."""
    linhas = aodp.to_snapshot_rows([_entry(sell_price_min=0)])

    assert len(linhas) == 1
    assert linhas[0]["sell_min"] is None
    assert linhas[0]["sell_source"] is None
    assert linhas[0]["buy_max"] == Decimal("107")


def test_linha_sem_nenhum_preco_e_descartada():
    assert aodp.to_snapshot_rows([_entry(sell_price_min=0, buy_price_max=0)]) == []


def test_os_dois_lados_tem_timestamps_independentes():
    """A própria API observa os lados em momentos diferentes. Colapsar num timestamp só
    mentiria sobre a idade de um deles."""
    linha = aodp.to_snapshot_rows([_entry()])[0]

    assert linha["sell_observed_at"] == datetime(2026, 9, 7, 21, 0, tzinfo=UTC)
    assert linha["buy_observed_at"] == datetime(2026, 9, 7, 19, 10, tzinfo=UTC)
    assert linha["sell_observed_at"] != linha["buy_observed_at"]


def test_mapeia_cidade_para_o_location_id_que_o_client_usa():
    """Lymhurst tem dois ids na tabela `location` (1002 e 1301). O dado real do client usa
    `1002`; apontar para `1301` faria as duas fontes gravarem linhas que nunca se encontram."""
    linha = aodp.to_snapshot_rows([_entry(city="Lymhurst")])[0]
    assert linha["location_id"] == "1002"

    assert aodp.to_snapshot_rows([_entry(city="Fort Sterling")])[0]["location_id"] == "4002"


def test_cidade_fora_do_mapa_e_ignorada_sem_inventar_location_id():
    assert aodp.to_snapshot_rows([_entry(city="Cidade Que Nao Existe")]) == []


def test_encantamento_vem_do_sufixo_do_item_id():
    linha = aodp.to_snapshot_rows([_entry(item_id="T6_FIBER_LEVEL3@3")])[0]
    assert linha["enchantment_level"] == 3
    assert aodp.to_snapshot_rows([_entry(item_id="T4_FIBER")])[0]["enchantment_level"] == 0


# --- Rede: falha isolada por lote ---


async def test_fetch_prices_monta_a_url_esperada():
    capturada = {}

    def handler(request: httpx.Request) -> httpx.Response:
        capturada["url"] = str(request.url)
        return httpx.Response(200, json=[_entry()])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        linhas = await aodp.fetch_prices(client, "https://west.exemplo", ["T4_FIBER", "T5_FIBER"])

    assert "/api/v2/stats/prices/T4_FIBER,T5_FIBER.json" in capturada["url"]
    assert "locations=" in capturada["url"]
    assert linhas[0]["item_id"] == "T4_FIBER"


async def test_erro_http_vira_excecao_para_quem_chama_decidir():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await aodp.fetch_prices(client, "https://west.exemplo", ["T4_FIBER"])


# --- Integração com a precedência da task 03 ---


async def test_aodp_nao_sobrescreve_preco_mais_novo_do_client(db_session):
    """O caminho que mais importa: o poller roda a cada 10 min e o dado dele tem mediana de 7 h.
    Sem a precedência, ele apagaria o preço de minutos atrás que o client trouxe."""
    await upsert_snapshot(
        db_session,
        "west",
        [
            {
                "item_id": "T4_FIBER",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "sell_min": Decimal("130"),
                "sell_observed_at": AGORA,
                "sell_source": SOURCE_CLIENT,
            }
        ],
    )
    await db_session.commit()

    velho = (AGORA - timedelta(hours=7)).replace(tzinfo=None).isoformat()
    linhas = aodp.to_snapshot_rows(
        [_entry(sell_price_min=999, sell_price_min_date=velho, buy_price_max=0)]
    )
    await upsert_snapshot(db_session, "west", linhas)
    await db_session.commit()

    row = (await db_session.scalars(select(PriceSnapshot))).one()
    assert row.sell_min == Decimal("130")
    assert row.sell_source == SOURCE_CLIENT


async def test_aodp_preenche_item_que_o_client_nunca_viu(db_session):
    """`X06`. É a razão de existir da task: cobertura que não depende de alguém abrir o mercado
    daquele item no jogo."""
    linhas = aodp.to_snapshot_rows(
        [
            _entry(item_id="T7_PLANKS", city="Martlock"),
            _entry(item_id="T8_LEATHER", city="Thetford"),
        ]
    )
    await upsert_snapshot(db_session, "west", linhas)
    await db_session.commit()

    rows = (await db_session.scalars(select(PriceSnapshot))).all()
    assert {r.item_id for r in rows} == {"T7_PLANKS", "T8_LEATHER"}
    assert all(r.sell_source == SOURCE_AODP for r in rows)


async def test_upsert_do_poller_e_idempotente(db_session):
    linhas = aodp.to_snapshot_rows([_entry()])
    await upsert_snapshot(db_session, "west", linhas)
    await db_session.commit()
    await upsert_snapshot(db_session, "west", linhas)
    await db_session.commit()

    rows = (await db_session.scalars(select(PriceSnapshot))).all()
    assert len(rows) == 1


# --- A task: falha de um lote não derruba os outros ---


async def test_lote_que_falha_nao_impede_os_outros_de_gravar(db_session, monkeypatch):
    """Indisponibilidade de um terceiro não pode travar a fila nem perder o trabalho já feito.
    Com 3 lotes e o do meio falhando, os outros dois têm que gravar."""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from src.database import engine
    from src.prices import tasks as prices_tasks
    from src.recipes.models import Recipe

    db_session.add_all(
        [
            Recipe(output_item_unique_name=f"T{t}_ALVO", production_kind="crafting")
            for t in range(2, 9)
        ]
    )
    await db_session.commit()

    # Um lote por item, para tornar a falha do meio observável.
    monkeypatch.setattr(aodp, "build_batches", lambda itens, **kw: [[i] for i in itens])

    chamadas: list[str] = []

    async def fake_fetch(client, base_url, items, cities=aodp.DEFAULT_CITIES):
        chamadas.append(items[0])
        if items[0] == "T4_ALVO":
            raise httpx.ConnectError("indisponível")
        return [_entry(item_id=items[0])]

    monkeypatch.setattr(aodp, "fetch_prices", fake_fetch)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    resumo = await prices_tasks._sync_aodp_realm(sessionmaker, "west")

    assert resumo["lotes_com_falha"] == 1
    assert len(chamadas) == 7, "os lotes seguintes ao que falhou continuaram"

    gravados = {r.item_id for r in (await db_session.scalars(select(PriceSnapshot))).all()}
    assert "T4_ALVO" not in gravados  # o que falhou não gravou
    assert len(gravados) == 6  # todos os outros gravaram


async def test_itens_para_cotar_sai_do_catalogo_nao_do_mercado(db_session):
    """`X01` na camada de coleta: puxar só o que já tem preço faria o item nunca observado
    continuar nunca sendo observado."""
    from src.prices.tasks import _itens_para_cotar
    from src.recipes.models import Recipe, RecipeIngredient

    receita = Recipe(output_item_unique_name="T5_SAIDA", production_kind="crafting")
    receita.ingredients.append(
        RecipeIngredient(ingredient_unique_name="T5_INGREDIENTE", count=2, position=0)
    )
    db_session.add(receita)
    await db_session.commit()

    itens = await _itens_para_cotar(db_session)

    # Nenhum dos dois tem uma linha sequer em `market_order`.
    assert "T5_SAIDA" in itens
    assert "T5_INGREDIENTE" in itens
