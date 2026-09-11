"""Task 4/02 — `GET /catalog/recipes`.

O teste que dá nome à fase é `test_receita_sem_nenhum_preco_aparece_no_catalogo`: contra a
arquitetura antiga (ranking materializado) ele é impossível de passar, porque a lista de
receitas era derivada de `market_order` (`ranking_service.py:174-189`).
"""

from decimal import Decimal

from sqlalchemy import event

from src.items.models import Item
from src.recipes.models import Recipe, RecipeIngredient


def _item(
    unique_name: str,
    *,
    name: str,
    tier: int,
    weight: str | None = None,
    sub2: str | None = None,
) -> Item:
    _, separator, suffix = unique_name.rpartition("@")
    return Item(
        unique_name=unique_name,
        name_pt=name,
        name_en=f"{name} EN",
        tier=tier,
        enchantment_level=int(suffix) if separator else 0,
        weight=Decimal(weight) if weight is not None else None,
        shop_category="crafting",
        shop_subcategory="refinedresources",
        shop_subcategory2=sub2,
        busca_normalizada=unique_name.casefold(),
    )


async def _seed(db_session):
    db_session.add_all(
        [
            _item("T4_CLOTH", name="Tecido Fino", tier=4, weight="0.51", sub2="cloth"),
            _item("T4_FIBER", name="Fibra", tier=4, weight="0.51"),
            _item("T3_CLOTH", name="Tecido Limpo", tier=3, weight="0.38"),
            _item("T5_ORPHAN", name="Item Sem Mercado", tier=5, weight="0.76"),
            _item("T5_ORE", name="Minério", tier=5),
            _item("T4_RUNE", name="Runa", tier=4),
            _item("T4_CLOTH@1", name="Tecido Fino Incomum", tier=4, weight="0.51"),
        ]
    )

    refino = Recipe(
        output_item_unique_name="T4_CLOTH",
        production_kind="refining",
        silver_cost=0,
        crafting_focus=18,
        amount_crafted=1,
        craft_time=Decimal("0.02083"),
    )
    # Inserida fora de ordem de propósito: a resposta tem que respeitar `position`.
    refino.ingredients.extend(
        [
            RecipeIngredient(ingredient_unique_name="T3_CLOTH", count=1, position=1),
            RecipeIngredient(ingredient_unique_name="T4_FIBER", count=2, position=0),
        ]
    )

    # A receita que a arquitetura antiga escondia: nenhuma linha em `market_order` para a saída.
    orfa = Recipe(
        output_item_unique_name="T5_ORPHAN",
        production_kind="crafting",
        silver_cost=120,
        crafting_focus=54,
        amount_crafted=1,
        craft_time=Decimal("0.1"),
    )
    orfa.ingredients.append(RecipeIngredient(ingredient_unique_name="T5_ORE", count=4, position=0))

    encantada = Recipe(
        output_item_unique_name="T4_CLOTH@1",
        production_kind="refining",
        enchantment_level=1,
        silver_cost=0,
        crafting_focus=36,
        amount_crafted=1,
        craft_time=Decimal("0.02083"),
        upgrade_resource_unique_name="T4_RUNE",
        upgrade_resource_count=8,
    )
    encantada.ingredients.append(
        RecipeIngredient(
            ingredient_unique_name="T4_FIBER", count=2, enchantment_level=1, position=0
        )
    )

    db_session.add_all([refino, orfa, encantada])
    await db_session.commit()


async def test_receita_sem_nenhum_preco_aparece_no_catalogo(cliente_autenticado, db_session):
    """`X01`. Nenhuma das receitas semeadas tem uma única linha em `market_order` — e todas
    aparecem. É o inverso exato do ranking materializado, que derivava a lista de receitas do
    que já tinha preço."""
    await _seed(db_session)

    response = await cliente_autenticado.get("/catalog/recipes")

    assert response.status_code == 200
    saidas = {r["output_item"] for r in response.json()["recipes"]}
    assert {"T4_CLOTH", "T5_ORPHAN", "T4_CLOTH@1"} <= saidas


async def test_filtra_por_production_kind(cliente_autenticado, db_session):
    await _seed(db_session)

    refino = (await cliente_autenticado.get("/catalog/recipes?kind=refining")).json()
    craft = (await cliente_autenticado.get("/catalog/recipes?kind=crafting")).json()

    assert {r["output_item"] for r in refino["recipes"]} == {"T4_CLOTH", "T4_CLOTH@1"}
    assert {r["output_item"] for r in craft["recipes"]} == {"T5_ORPHAN"}
    assert refino["kind"] == "refining"
    assert all(r["production_kind"] == "refining" for r in refino["recipes"])


async def test_kind_invalido_e_rejeitado(cliente_autenticado):
    assert (await cliente_autenticado.get("/catalog/recipes?kind=mineracao")).status_code == 422


async def test_ingredientes_respeitam_a_ordem_original(cliente_autenticado, db_session):
    await _seed(db_session)

    payload = (await cliente_autenticado.get("/catalog/recipes?kind=refining")).json()
    receita = next(r for r in payload["recipes"] if r["output_item"] == "T4_CLOTH")

    # position 0 = T4_FIBER, position 1 = T3_CLOTH — apesar da inserção invertida no seed.
    assert [i["item"] for i in receita["ingredients"]] == ["T4_FIBER", "T3_CLOTH"]
    assert [i["count"] for i in receita["ingredients"]] == [2, 1]


async def test_dicionario_de_itens_cobre_tudo_que_as_receitas_referenciam(
    cliente_autenticado, db_session
):
    await _seed(db_session)

    payload = (await cliente_autenticado.get("/catalog/recipes")).json()

    referenciados = set()
    for receita in payload["recipes"]:
        referenciados.add(receita["output_item"])
        referenciados |= {i["item"] for i in receita["ingredients"]}
        if receita["upgrade_resource"]:
            referenciados.add(receita["upgrade_resource"]["item"])

    catalogados = [i["unique_name"] for i in payload["items"]]
    assert referenciados <= set(catalogados)
    assert len(catalogados) == len(set(catalogados)), "item duplicado no dicionário"


async def test_peso_viaja_como_string_decimal(cliente_autenticado, db_session):
    """F09: o peso entra na divisão `lucro / peso`, cujo resultado o usuário lê."""
    await _seed(db_session)

    payload = (await cliente_autenticado.get("/catalog/recipes")).json()
    itens = {i["unique_name"]: i for i in payload["items"]}

    assert itens["T4_CLOTH"]["weight"] == "0.51"
    assert isinstance(itens["T4_CLOTH"]["weight"], str)
    assert itens["T5_ORE"]["weight"] is None  # sem peso no dump não vira zero


async def test_terceiro_nivel_de_categoria_viaja_no_item(cliente_autenticado, db_session):
    """Task 4/21. As famílias do refino (tecido, couro, barras…) só existem no
    `shop_subcategory2`: todo produto refinado é `crafting/refinedresources` nos dois primeiros
    níveis. Sem este campo a tela não tem por onde agrupar."""
    await _seed(db_session)

    payload = (await cliente_autenticado.get("/catalog/recipes?kind=refining")).json()
    itens = {i["unique_name"]: i for i in payload["items"]}

    assert itens["T4_CLOTH"]["shop_subcategory2"] == "cloth"
    assert itens["T4_FIBER"]["shop_subcategory2"] is None


async def test_upgrade_resource_quando_existe(cliente_autenticado, db_session):
    await _seed(db_session)

    payload = (await cliente_autenticado.get("/catalog/recipes?kind=refining")).json()
    receitas = {r["output_item"]: r for r in payload["recipes"]}

    assert receitas["T4_CLOTH@1"]["upgrade_resource"] == {"item": "T4_RUNE", "count": 8}
    assert receitas["T4_CLOTH"]["upgrade_resource"] is None


async def test_numero_de_statements_e_constante(cliente_autenticado, db_session):
    """Prova de que não há N+1 sobre os ingredientes: dobrar a quantidade de receitas não pode
    mudar a contagem de statements."""
    await _seed(db_session)

    from src.database import engine

    contador = {"n": 0}

    def _conta(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            contador["n"] += 1

    event.listen(engine.sync_engine, "before_cursor_execute", _conta)
    try:
        contador["n"] = 0
        await cliente_autenticado.get("/catalog/recipes")
        com_tres_receitas = contador["n"]

        extras = []
        for i in range(12):
            db_session.add(_item(f"T6_EXTRA{i}", name=f"Extra {i}", tier=6, weight="1.14"))
            receita = Recipe(
                output_item_unique_name=f"T6_EXTRA{i}",
                production_kind="crafting",
                amount_crafted=1,
                craft_time=Decimal("0.1"),
            )
            receita.ingredients.append(
                RecipeIngredient(ingredient_unique_name="T5_ORE", count=2, position=0)
            )
            extras.append(receita)
        db_session.add_all(extras)
        await db_session.commit()

        contador["n"] = 0
        await cliente_autenticado.get("/catalog/recipes")
        com_quinze_receitas = contador["n"]
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", _conta)

    assert com_quinze_receitas == com_tres_receitas, (
        f"N+1: {com_tres_receitas} statements com 3 receitas, "
        f"{com_quinze_receitas} com 15 — deveria ser constante"
    )


async def test_etag_e_304(cliente_autenticado, db_session):
    await _seed(db_session)

    primeira = await cliente_autenticado.get("/catalog/recipes?kind=refining")
    etag = primeira.headers["ETag"]
    assert etag
    assert "private" in primeira.headers["Cache-Control"]

    revalidacao = await cliente_autenticado.get(
        "/catalog/recipes?kind=refining", headers={"If-None-Match": etag}
    )
    assert revalidacao.status_code == 304
    assert revalidacao.content == b""
    assert revalidacao.headers["ETag"] == etag

    outro = await cliente_autenticado.get(
        "/catalog/recipes?kind=refining", headers={"If-None-Match": '"nao-e-o-etag"'}
    )
    assert outro.status_code == 200


async def test_etag_difere_por_kind(cliente_autenticado, db_session):
    """`?kind=refining` e `?kind=crafting` são corpos diferentes: compartilhar validador
    entregaria o catálogo errado a partir do cache."""
    await _seed(db_session)

    refino = await cliente_autenticado.get("/catalog/recipes?kind=refining")
    craft = await cliente_autenticado.get("/catalog/recipes?kind=crafting")

    assert refino.headers["ETag"] != craft.headers["ETag"]

    cruzado = await cliente_autenticado.get(
        "/catalog/recipes?kind=crafting", headers={"If-None-Match": refino.headers["ETag"]}
    )
    assert cruzado.status_code == 200


async def test_exige_autenticacao(client):
    assert (await client.get("/catalog/recipes")).status_code == 401
