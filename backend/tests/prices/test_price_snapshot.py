"""Task 4/03 — `price_snapshot` + `GET /prices/snapshot`.

O teste que carrega a decisão da fase é `test_endpoint_nao_filtra_por_frescor`: preço velho
**aparece**, com a idade denunciada em `observed_at`. Esconder linha velha era `X02`.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from src.prices.models import MarketOrder, PriceSnapshot
from src.prices.snapshot import (
    SOURCE_AODP,
    SOURCE_CLIENT,
    refresh_snapshot_from_orders,
    upsert_snapshot,
)

AGORA = datetime.now(UTC)


def _order(
    *,
    item="T4_FIBER",
    location="1002",
    price: str,
    auction_type: str,
    amount=10,
    quality=1,
    enchantment=0,
    source_id=None,
    last_seen=None,
) -> MarketOrder:
    return MarketOrder(
        server_id="west",
        source_id=source_id or uuid.uuid4().int % 10_000_000,
        item_id=item,
        group_type_id=item,
        location_id=location,
        quality_level=quality,
        enchantment_level=enchantment,
        unit_price_silver=Decimal(price),
        amount=amount,
        auction_type=auction_type,
        expires=AGORA + timedelta(days=7),
        last_seen_at=last_seen or AGORA,
    )


async def test_deriva_topo_de_livro_dos_dois_lados(db_session):
    db_session.add_all(
        [
            _order(price="130", auction_type="offer"),
            _order(price="145", auction_type="offer"),  # mais caro: não é o topo
            _order(price="128", auction_type="offer"),  # o menor offer vence
            _order(price="100", auction_type="request"),
            _order(price="120", auction_type="request"),  # o maior request vence
        ]
    )
    await db_session.commit()

    await refresh_snapshot_from_orders(db_session, "west", {("T4_FIBER", "1002", 1, 0)})
    await db_session.commit()

    row = (await db_session.scalars(select(PriceSnapshot))).one()
    assert row.sell_min == Decimal("128")  # o que você paga comprando agora
    assert row.buy_max == Decimal("120")  # o que você recebe vendendo agora
    assert row.sell_source == SOURCE_CLIENT
    assert row.buy_source == SOURCE_CLIENT


async def test_lado_ausente_e_null_nunca_zero(db_session):
    """Ausência de preço não é preço zero — é a microcópia do produto virada em schema."""
    db_session.add(_order(price="130", auction_type="offer"))
    await db_session.commit()

    await refresh_snapshot_from_orders(db_session, "west", {("T4_FIBER", "1002", 1, 0)})
    await db_session.commit()

    row = (await db_session.scalars(select(PriceSnapshot))).one()
    assert row.sell_min == Decimal("130")
    assert row.buy_max is None
    assert row.buy_observed_at is None
    assert row.buy_source is None


async def test_observacao_nova_substitui_a_anterior_sem_acumular_linha(db_session):
    db_session.add(_order(price="130", auction_type="offer", source_id=1, last_seen=AGORA))
    await db_session.commit()
    await refresh_snapshot_from_orders(db_session, "west", {("T4_FIBER", "1002", 1, 0)})
    await db_session.commit()

    # Nova varredura do mesmo combo, mais recente e mais barata.
    db_session.add(
        _order(
            price="99",
            auction_type="offer",
            source_id=2,
            last_seen=AGORA + timedelta(minutes=5),
        )
    )
    await db_session.commit()
    await refresh_snapshot_from_orders(db_session, "west", {("T4_FIBER", "1002", 1, 0)})
    await db_session.commit()

    rows = (await db_session.scalars(select(PriceSnapshot))).all()
    assert len(rows) == 1, "o snapshot é estado atual, não log"
    assert rows[0].sell_min == Decimal("99")


# --- Precedência entre fontes: por lado, o mais recente vence ---


async def _snapshot_com_client(db_session, *, observed_at: datetime):
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
                "sell_observed_at": observed_at,
                "sell_source": SOURCE_CLIENT,
                "buy_max": Decimal("120"),
                "buy_observed_at": observed_at,
                "buy_source": SOURCE_CLIENT,
            }
        ],
    )
    await db_session.commit()


async def test_fonte_mais_velha_nao_sobrescreve_a_mais_nova(db_session):
    """O poller da API pública tem mediana de 7 h de idade. Sem esta regra ele apagaria o preço
    de minutos atrás que o nosso client trouxe — o produto ficaria pior onde tem o melhor dado."""
    await _snapshot_com_client(db_session, observed_at=AGORA)

    await upsert_snapshot(
        db_session,
        "west",
        [
            {
                "item_id": "T4_FIBER",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "sell_min": Decimal("999"),
                "sell_observed_at": AGORA - timedelta(hours=7),  # mais velho
                "sell_source": SOURCE_AODP,
                "buy_max": Decimal("1"),
                "buy_observed_at": AGORA - timedelta(hours=7),
                "buy_source": SOURCE_AODP,
            }
        ],
    )
    await db_session.commit()

    row = (await db_session.scalars(select(PriceSnapshot))).one()
    assert row.sell_min == Decimal("130")
    assert row.sell_source == SOURCE_CLIENT
    assert row.buy_max == Decimal("120")
    assert row.buy_source == SOURCE_CLIENT


async def test_fonte_mais_nova_sobrescreve(db_session):
    await _snapshot_com_client(db_session, observed_at=AGORA - timedelta(hours=12))

    await upsert_snapshot(
        db_session,
        "west",
        [
            {
                "item_id": "T4_FIBER",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "sell_min": Decimal("140"),
                "sell_observed_at": AGORA,
                "sell_source": SOURCE_AODP,
                "buy_max": Decimal("125"),
                "buy_observed_at": AGORA,
                "buy_source": SOURCE_AODP,
            }
        ],
    )
    await db_session.commit()

    row = (await db_session.scalars(select(PriceSnapshot))).one()
    assert row.sell_min == Decimal("140")
    assert row.sell_source == SOURCE_AODP


async def test_precedencia_e_por_lado_nao_pela_linha(db_session):
    """Um lado pode ser mais novo e o outro mais velho no mesmo payload — cada um decide
    sozinho."""
    await _snapshot_com_client(db_session, observed_at=AGORA)

    await upsert_snapshot(
        db_session,
        "west",
        [
            {
                "item_id": "T4_FIBER",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "sell_min": Decimal("999"),
                "sell_observed_at": AGORA - timedelta(hours=3),  # mais velho: perde
                "sell_source": SOURCE_AODP,
                "buy_max": Decimal("777"),
                "buy_observed_at": AGORA + timedelta(minutes=10),  # mais novo: ganha
                "buy_source": SOURCE_AODP,
            }
        ],
    )
    await db_session.commit()

    row = (await db_session.scalars(select(PriceSnapshot))).one()
    assert row.sell_min == Decimal("130") and row.sell_source == SOURCE_CLIENT
    assert row.buy_max == Decimal("777") and row.buy_source == SOURCE_AODP


# --- Endpoint (formato colunar) ---


def _linhas(payload: dict) -> list[dict]:
    """Desfaz o formato colunar. É exatamente o que o cliente faz — se este helper for
    complicado de escrever, o formato está errado."""
    c = payload["columns"]
    return [
        {
            "item_id": payload["items"][c["item"][i]],
            "location_id": payload["locations"][c["location"][i]],
            "quality_level": c["quality"][i],
            "enchantment_level": c["enchantment"][i],
            "sell_min": c["sell_min"][i],
            "sell_observed_at": c["sell_observed_at"][i],
            "sell_source": (
                None if c["sell_source"][i] is None else payload["sources"][c["sell_source"][i]]
            ),
            "buy_max": c["buy_max"][i],
            "buy_observed_at": c["buy_observed_at"][i],
            "buy_source": (
                None if c["buy_source"][i] is None else payload["sources"][c["buy_source"][i]]
            ),
        }
        for i in range(payload["row_count"])
    ]


async def test_endpoint_nao_filtra_por_frescor(cliente_autenticado, db_session):
    """`X02`. Preço de 30 dias atrás **aparece**, com a idade denunciada. Esconder linha velha
    por decisão do servidor era o que fazia receita sumir do produto."""
    antigo = AGORA - timedelta(days=30)
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
                "sell_observed_at": antigo,
                "sell_source": SOURCE_AODP,
            }
        ],
    )
    await db_session.commit()

    payload = (await cliente_autenticado.get("/prices/snapshot?server=west")).json()
    linhas = _linhas(payload)

    assert payload["row_count"] == 1
    assert linhas[0]["sell_min"] == "130"
    assert linhas[0]["sell_source"] == SOURCE_AODP
    # epoch em segundos, não ISO — e a idade real é preservada.
    assert linhas[0]["sell_observed_at"] == int(antigo.timestamp())
    assert linhas[0]["buy_max"] is None


async def test_endpoint_filtra_por_location(cliente_autenticado, db_session):
    await upsert_snapshot(
        db_session,
        "west",
        [
            {
                "item_id": "T4_FIBER",
                "location_id": loc,
                "quality_level": 1,
                "enchantment_level": 0,
                "sell_min": Decimal("130"),
                "sell_observed_at": AGORA,
                "sell_source": SOURCE_CLIENT,
            }
            for loc in ("1002", "3005", "4002")
        ],
    )
    await db_session.commit()

    todos = (await cliente_autenticado.get("/prices/snapshot?server=west")).json()
    assert todos["row_count"] == 3

    duas = (
        await cliente_autenticado.get(
            "/prices/snapshot?server=west&location_id=1002&location_id=4002"
        )
    ).json()
    assert {linha["location_id"] for linha in _linhas(duas)} == {"1002", "4002"}


async def test_endpoint_preco_e_string_decimal(cliente_autenticado, db_session):
    """F09 sobrevive à compactação: índice para string repetida, mas dinheiro continua decimal."""
    await upsert_snapshot(
        db_session,
        "west",
        [
            {
                "item_id": "T4_FIBER",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "sell_min": Decimal("1234.5000"),
                "sell_observed_at": AGORA,
                "sell_source": SOURCE_CLIENT,
            }
        ],
    )
    await db_session.commit()

    payload = (await cliente_autenticado.get("/prices/snapshot?server=west")).json()
    assert payload["columns"]["sell_min"][0] == "1234.5"
    assert isinstance(payload["columns"]["sell_min"][0], str)


async def test_dicionarios_nao_repetem_valor(cliente_autenticado, db_session):
    """A economia do formato vem daqui: o mesmo item em 3 cidades entra uma vez em `items`."""
    await upsert_snapshot(
        db_session,
        "west",
        [
            {
                "item_id": "T4_FIBER",
                "location_id": loc,
                "quality_level": 1,
                "enchantment_level": 0,
                "sell_min": Decimal("130"),
                "sell_observed_at": AGORA,
                "sell_source": SOURCE_CLIENT,
            }
            for loc in ("1002", "3005", "4002")
        ],
    )
    await db_session.commit()

    payload = (await cliente_autenticado.get("/prices/snapshot?server=west")).json()

    assert payload["items"] == ["T4_FIBER"]  # 3 linhas, 1 entrada
    assert len(payload["locations"]) == 3
    assert payload["sources"] == [SOURCE_CLIENT]
    assert all(len(coluna) == 3 for coluna in payload["columns"].values())


async def test_endpoint_exige_autenticacao(client):
    assert (await client.get("/prices/snapshot?server=west")).status_code == 401
