"""Task 4/23 — `GET /prices/sales`: quantas unidades vendem por dia.

É a leitura que a tela usa ao lado do preço de venda. Um lucro de +44 mil num item que vende 7 por
dia não é lucro: sem volume, a tabela mostra oportunidades que o mercado não absorve.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from src.items.models import Item
from src.prices.models import MarketHistoryDaily
from src.recipes.models import Recipe, RecipeIngredient

HOJE = datetime.now(UTC).date()


def _item(unique_name: str, albion_id: int, *, cat=None, sub=None, sub2=None) -> Item:
    return Item(
        unique_name=unique_name,
        albion_id=albion_id,
        enchantment_level=0,
        shop_category=cat,
        shop_subcategory=sub,
        shop_subcategory2=sub2,
        busca_normalizada=unique_name.casefold(),
    )


def _dia(
    albion_id: int, location: str, dias_atras: int, unidades: int, prata: str
) -> MarketHistoryDaily:
    return MarketHistoryDaily(
        server_id="west",
        item_id=albion_id,
        location_id=location,
        quality_level=1,
        dia=HOJE - timedelta(days=dias_atras),
        item_amount=unidades,
        silver_amount=Decimal(prata),
        preco_medio=Decimal(prata) / unidades,
    )


async def _seed(db_session):
    db_session.add_all(
        [
            _item("T4_MAIN_SWORD", 910_001, cat="weapons", sub="sword"),
            _item("T4_2H_BOW", 910_002, cat="weapons", sub="bow"),
            _item("T4_METALBAR", 910_003, cat="crafting", sub="refinedresources", sub2="metalbars"),
            _item("T4_SEM_HISTORICO", 910_004, cat="weapons", sub="sword"),
        ]
    )
    espada = Recipe(output_item_unique_name="T4_MAIN_SWORD", production_kind="crafting")
    espada.ingredients.append(
        RecipeIngredient(ingredient_unique_name="T4_METALBAR", count=16, position=0)
    )
    db_session.add_all(
        [
            espada,
            Recipe(output_item_unique_name="T4_2H_BOW", production_kind="crafting"),
            Recipe(output_item_unique_name="T4_SEM_HISTORICO", production_kind="crafting"),
        ]
    )

    linhas = []
    # Espada em Lymhurst: 10 por dia nos 7 dias completos, a 100 cada.
    linhas += [_dia(910_001, "1002", d, 10, "1000") for d in range(1, 8)]
    # Fora da janela: 8 dias atrás, e hoje (o dia ainda não fechou).
    linhas += [_dia(910_001, "1002", 8, 999, "99900"), _dia(910_001, "1002", 0, 500, "50000")]
    # Espada em Martlock: só 2 dias com venda, 7 em cada — a média é sobre 7 dias, não sobre 2.
    linhas += [_dia(910_001, "3008", d, 7, "700") for d in (1, 2)]
    # Arco (outra subcategoria) e barra (ingrediente): não entram no recorte de espadas.
    linhas += [_dia(910_002, "1002", d, 5, "5000") for d in range(1, 8)]
    linhas += [_dia(910_003, "1002", d, 100, "30000") for d in range(1, 8)]
    db_session.add_all(linhas)
    await db_session.commit()


def _linhas(payload: dict) -> dict[tuple[str, str, int], dict]:
    c = payload["columns"]
    return {
        (payload["items"][c["item"][i]], payload["locations"][c["location"][i]], c["quality"][i]): {
            "units_per_day": c["units_per_day"][i],
            "average_price": c["average_price"][i],
            "days_with_data": c["days_with_data"][i],
        }
        for i in range(payload["row_count"])
    }


async def test_unidades_por_dia_nos_ultimos_7_dias_completos(cliente_autenticado, db_session):
    await _seed(db_session)

    resposta = await cliente_autenticado.get(
        "/prices/sales?server=west&kind=crafting&category=weapons&subcategory=sword"
    )
    assert resposta.status_code == 200, resposta.text
    payload = resposta.json()
    linhas = _linhas(payload)

    assert payload["days"] == 7
    assert linhas[("T4_MAIN_SWORD", "1002", 1)] == {
        "units_per_day": "10",
        "average_price": "100",
        "days_with_data": 7,
    }
    # Dia sem venda é dia sem venda: 14 unidades em 7 dias são 2 por dia, não 7.
    assert linhas[("T4_MAIN_SWORD", "3008", 1)]["units_per_day"] == "2"
    assert linhas[("T4_MAIN_SWORD", "3008", 1)]["days_with_data"] == 2


async def test_recorte_da_categoria_traz_so_os_itens_produzidos(cliente_autenticado, db_session):
    """O volume que a tela mostra é o de **venda** da saída. A barra é ingrediente da espada —
    trazer o volume dela seria payload a mais que ninguém lê."""
    await _seed(db_session)

    payload = (
        await cliente_autenticado.get(
            "/prices/sales?server=west&kind=crafting&category=weapons&subcategory=sword"
        )
    ).json()
    itens = {item for item, _, _ in _linhas(payload)}

    assert itens == {"T4_MAIN_SWORD"}


async def test_item_sem_historico_fica_ausente_nunca_zero(cliente_autenticado, db_session):
    await _seed(db_session)

    payload = (
        await cliente_autenticado.get(
            "/prices/sales?server=west&kind=crafting&category=weapons&subcategory=sword"
        )
    ).json()

    assert "T4_SEM_HISTORICO" not in payload["items"]


async def test_sem_categoria_traz_o_realm(cliente_autenticado, db_session):
    await _seed(db_session)

    payload = (await cliente_autenticado.get("/prices/sales?server=west")).json()
    itens = {item for item, _, _ in _linhas(payload)}

    assert itens == {"T4_MAIN_SWORD", "T4_2H_BOW", "T4_METALBAR"}


async def test_categoria_sem_kind_e_rejeitada(cliente_autenticado):
    resposta = await cliente_autenticado.get("/prices/sales?server=west&category=weapons")
    assert resposta.status_code == 422


async def test_exige_autenticacao(client):
    assert (await client.get("/prices/sales?server=west")).status_code == 401


async def test_output_item_traz_so_as_saidas_pedidas_e_normaliza_ordem(
    cliente_autenticado, db_session
):
    await _seed(db_session)

    primeira = (
        await cliente_autenticado.get(
            "/prices/sales",
            params=[
                ("server", "west"),
                ("output_item", "T4_2H_BOW"),
                ("output_item", "T4_MAIN_SWORD"),
            ],
        )
    ).json()
    segunda = (
        await cliente_autenticado.get(
            "/prices/sales",
            params=[
                ("server", "west"),
                ("output_item", "T4_MAIN_SWORD"),
                ("output_item", "T4_2H_BOW"),
                ("output_item", "T4_MAIN_SWORD"),
            ],
        )
    ).json()

    assert _linhas(primeira) == _linhas(segunda)
    assert {item for item, _, _ in _linhas(primeira)} == {"T4_MAIN_SWORD", "T4_2H_BOW"}


async def test_sales_output_item_rejeita_categoria_e_excesso(cliente_autenticado):
    conflito = await cliente_autenticado.get(
        "/prices/sales",
        params={"server": "west", "category": "weapons", "output_item": "T4_MAIN_SWORD"},
    )
    excesso = await cliente_autenticado.get(
        "/prices/sales",
        params=[("server", "west"), *(("output_item", f"T4_{i}") for i in range(201))],
    )

    assert conflito.status_code == 422
    assert excesso.status_code == 422
