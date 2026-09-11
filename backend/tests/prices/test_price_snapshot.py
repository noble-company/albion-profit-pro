"""Task 4/03 — `price_snapshot` + `GET /prices/snapshot`.

O teste que carrega a decisão da fase é `test_endpoint_nao_filtra_por_frescor`: preço velho
**aparece**, com a idade denunciada em `observed_at`. Esconder linha velha era `X02`.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from src.items.models import Item
from src.prices.models import MarketOrder, PriceSnapshot
from src.prices.snapshot import (
    SOURCE_AODP,
    SOURCE_CLIENT,
    refresh_snapshot_from_orders,
    upsert_snapshot,
)
from src.recipes.models import Recipe, RecipeIngredient

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


# --- Recorte por categoria (task 4/22) ---


def _item(unique_name: str, *, cat=None, sub=None, sub2=None) -> Item:
    return Item(
        unique_name=unique_name,
        enchantment_level=0,
        shop_category=cat,
        shop_subcategory=sub,
        shop_subcategory2=sub2,
        busca_normalizada=unique_name.casefold(),
    )


def _receita(saida: str, kind: str, ingredientes: list[str], upgrade: str | None = None) -> Recipe:
    receita = Recipe(
        output_item_unique_name=saida,
        production_kind=kind,
        amount_crafted=1,
        craft_time=Decimal("0.1"),
        upgrade_resource_unique_name=upgrade,
        upgrade_resource_count=1 if upgrade else None,
    )
    receita.ingredients.extend(
        RecipeIngredient(ingredient_unique_name=nome, count=1, position=i)
        for i, nome in enumerate(ingredientes)
    )
    return receita


async def _seed_categorias(db_session):
    """Uma espada e um arco (Armas), um tecido (refino, família `cloth`), um token sem categoria
    nenhuma no dump, e um item que não é de receita nenhuma — todos com preço no snapshot."""
    db_session.add_all(
        [
            _item("T4_MAIN_SWORD", cat="weapons", sub="sword"),
            _item("T4_2H_BOW", cat="weapons", sub="bow"),
            _item("T4_METALBAR", cat="crafting", sub="refinedresources", sub2="metalbars"),
            _item("T4_PLANKS", cat="crafting", sub="refinedresources", sub2="planks"),
            _item("T4_RUNE", cat="artefacts", sub="fragments"),
            _item("T4_CLOTH", cat="crafting", sub="refinedresources", sub2="cloth"),
            _item("T4_FIBER", cat="gathering", sub="fiber"),
            _item("T3_CLOTH", cat="crafting", sub="refinedresources", sub2="cloth"),
            _item("T4_RANDOM_DUNGEON_TOKEN_2"),
            _item("T4_SOUL"),
            _item("T8_FORA_DE_RECEITA", cat="other", sub="other"),
        ]
    )
    db_session.add_all(
        [
            _receita("T4_MAIN_SWORD", "crafting", ["T4_METALBAR"], upgrade="T4_RUNE"),
            _receita("T4_2H_BOW", "crafting", ["T4_PLANKS"]),
            _receita("T4_CLOTH", "refining", ["T4_FIBER", "T3_CLOTH"]),
            _receita("T4_RANDOM_DUNGEON_TOKEN_2", "crafting", ["T4_SOUL"]),
        ]
    )
    await db_session.commit()

    await upsert_snapshot(
        db_session,
        "west",
        [
            {
                "item_id": nome,
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "sell_min": Decimal("100"),
                "sell_observed_at": AGORA,
                "sell_source": SOURCE_CLIENT,
            }
            for nome in (
                "T4_MAIN_SWORD",
                "T4_2H_BOW",
                "T4_METALBAR",
                "T4_PLANKS",
                "T4_RUNE",
                "T4_CLOTH",
                "T4_FIBER",
                "T3_CLOTH",
                "T4_RANDOM_DUNGEON_TOKEN_2",
                "T4_SOUL",
                "T8_FORA_DE_RECEITA",
            )
        ],
    )
    await db_session.commit()


async def _itens(cliente, query: str) -> set[str]:
    resposta = await cliente.get(f"/prices/snapshot?server=west&{query}")
    assert resposta.status_code == 200, resposta.text
    return {linha["item_id"] for linha in _linhas(resposta.json())}


async def test_subcategoria_traz_saidas_ingredientes_e_upgrade(cliente_autenticado, db_session):
    """Task 4/22. A tela calcula uma subcategoria por vez (task 21); o snapshot traz só o que
    essas receitas precisam cotar — e nada da vizinha. O realm inteiro são 187 KB com gzip; uma
    subcategoria, de 4 a 15 KB."""
    await _seed_categorias(db_session)

    itens = await _itens(cliente_autenticado, "kind=crafting&category=weapons&subcategory=sword")

    assert itens == {"T4_MAIN_SWORD", "T4_METALBAR", "T4_RUNE"}


async def test_categoria_inteira_junta_as_subcategorias(cliente_autenticado, db_session):
    await _seed_categorias(db_session)

    itens = await _itens(cliente_autenticado, "kind=crafting&category=weapons")

    assert itens == {"T4_MAIN_SWORD", "T4_METALBAR", "T4_RUNE", "T4_2H_BOW", "T4_PLANKS"}


async def test_no_refino_a_categoria_e_a_familia(cliente_autenticado, db_session):
    """Todo refinado é `crafting/refinedresources` nos dois primeiros níveis; a família mora no
    `shop_subcategory2` — a mesma regra de `lugarDaReceita` no frontend."""
    await _seed_categorias(db_session)

    itens = await _itens(cliente_autenticado, "kind=refining&category=cloth")

    assert itens == {"T4_CLOTH", "T4_FIBER", "T3_CLOTH"}


async def test_saida_sem_categoria_mora_em_outros(cliente_autenticado, db_session):
    """No frontend, item sem categoria no dump vai para Outros (task 21). Se o servidor não
    seguisse a mesma regra, a tela escolheria Outros e receberia um snapshot sem os tokens."""
    await _seed_categorias(db_session)

    itens = await _itens(cliente_autenticado, "kind=crafting&category=other&subcategory=other")

    assert itens == {"T4_RANDOM_DUNGEON_TOKEN_2", "T4_SOUL"}


async def test_sem_categoria_o_snapshot_e_o_realm_inteiro(cliente_autenticado, db_session):
    """Todas, Top 15 e busca continuam pedindo tudo — inclusive item fora de receita."""
    await _seed_categorias(db_session)

    itens = await _itens(cliente_autenticado, "")

    assert len(itens) == 11
    assert "T8_FORA_DE_RECEITA" in itens


async def test_categoria_sem_kind_e_rejeitada(cliente_autenticado):
    """A mesma `category` significa coisas diferentes no refino (família) e no craft."""
    resposta = await cliente_autenticado.get("/prices/snapshot?server=west&category=cloth")
    assert resposta.status_code == 422
