import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import event

from src.craft.schemas import CraftSimulationRequest
from src.craft.service import simulate_craft
from src.database import engine as db_engine
from src.items.models import Item
from src.prices.models import MarketOrder, MarketScan
from src.recipes.models import Recipe, RecipeIngredient


def _item(unique_name: str, albion_id: int, item_value: str | None = None) -> Item:
    return Item(
        unique_name=unique_name,
        albion_id=albion_id,
        name_pt=unique_name,
        name_en=unique_name,
        tier=2,
        enchantment_level=0,
        item_value=Decimal(item_value) if item_value else None,
        busca_normalizada=unique_name.casefold(),
    )


async def _seed_recipe(
    db_session,
    *,
    output_item: str = "T2_CLOTH",
    # `(nome, quantidade)` ou `(nome, quantidade, retorna)` — a marca do dump (task 4/26).
    ingredients: list[tuple] | None = None,
    amount_crafted: int = 1,
    silver_cost: int = 0,
    crafting_focus: int = 18,
    item_value: str | None = None,
) -> None:
    ingredients = ingredients or [("T2_FIBER", 1)]
    db_session.add(_item(output_item, 900_000, item_value))
    recipe = Recipe(
        output_item_unique_name=output_item,
        output_item_id=900_000,
        amount_crafted=amount_crafted,
        silver_cost=silver_cost,
        crafting_focus=crafting_focus,
        craft_time=Decimal("0"),
    )
    for position, (unique_name, count, *marca) in enumerate(ingredients):
        item_id = 900_001 + position
        db_session.add(_item(unique_name, item_id))
        # Só passa a marca quando o teste declara: os outros testes continuam no padrão da coluna.
        extra = {"return_eligible": marca[0]} if marca else {}
        recipe.ingredients.append(
            RecipeIngredient(
                ingredient_unique_name=unique_name,
                ingredient_item_id=item_id,
                count=count,
                enchantment_level=0,
                position=position,
                **extra,
            )
        )
    db_session.add(recipe)
    await db_session.commit()


def _order(
    item_id: str,
    auction_type: str,
    price: str,
    amount: int,
    *,
    quality: int = 1,
    seen_at: datetime | None = None,
    server: str = "west",
) -> MarketOrder:
    return MarketOrder(
        server_id=server,
        source_id=uuid.uuid4().int % 9_000_000_000 + 1,
        item_id=item_id,
        group_type_id="",
        location_id="1002",
        quality_level=quality,
        enchantment_level=0,
        unit_price_silver=Decimal(price),
        amount=amount,
        auction_type=auction_type,
        expires=datetime.now(timezone.utc) + timedelta(days=30),
        last_seen_at=seen_at or datetime.now(timezone.utc),
    )


def _scan(user_id, item_id: str, *, quality: int = 1, server: str = "west") -> MarketScan:
    return MarketScan(
        server_id=server,
        user_id=user_id,
        item_key=item_id,
        location_id="1002",
        quality_level=quality,
        fonte="livro",
    )


def _payload(**overrides) -> dict:
    payload = {
        "server": "west",
        "output_item": "T2_CLOTH",
        "quantity": 8,
        "location_id": "1002",
        "return_rate": "0",
        "station_fee_per_100_nutrition": "3",
        "use_focus": True,
        "premium": True,
    }
    payload.update(overrides)
    return payload


def _scenario(body: dict, acquisition: str, sale: str) -> dict:
    return next(
        scenario
        for scenario in body["scenarios"]
        if scenario["acquisition_mode"] == acquisition and scenario["sale_mode"] == sale
    )


async def test_simulate_requires_jwt(client) -> None:
    response = await client.post("/craft/simulate", json=_payload())

    assert response.status_code == 401


async def test_simulate_contract_is_published_in_openapi(client) -> None:
    operation = (await client.get("/openapi.json")).json()["paths"]["/craft/simulate"]["post"]

    assert operation["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/CraftSimulationRequest"
    }
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/CraftSimulationOut"
    }


async def test_four_scenarios_use_slippage_and_correct_fees(
    cliente_autenticado, db_session
) -> None:
    # `@itemvalue` real do T2_CLOTH. Sem ele a estação não cobra nada e o teste deixaria de
    # exercitar a taxa que o nome dele promete (task 4/18).
    await _seed_recipe(db_session, item_value="4")
    db_session.add_all(
        [
            _order("T2_FIBER", "offer", "100", 5),
            _order("T2_FIBER", "offer", "110", 5),
            _order("T2_FIBER", "request", "90", 20),
            _order("T2_CLOTH", "request", "150", 20),
            _order("T2_CLOTH", "offer", "160", 20),
        ]
    )
    await db_session.commit()

    response = await cliente_autenticado.post(
        "/craft/simulate", json=_payload(station_fee_per_100_nutrition="500")
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["executions"] == 8
    assert body["focus_consumed"] == 144
    ingredient = body["ingredients"][0]
    assert [
        {key: level[key] for key in ("unit_price", "quantity", "subtotal")}
        for level in ingredient["immediate_purchase"]["levels"]
    ] == [
        {"unit_price": "100.0000", "quantity": 5, "subtotal": "500.0000"},
        {"unit_price": "110.0000", "quantity": 3, "subtotal": "330.0000"},
    ]
    assert ingredient["immediate_purchase"]["oldest_observed_at"] is not None
    assert ingredient["immediate_purchase"]["age_seconds"] >= 0
    assert ingredient["immediate_purchase"]["total"] == "830.0000"
    assert len(body["scenarios"]) == 4

    immediate = _scenario(body, "immediate", "immediate")
    assert immediate["costs"]["total_cost"] == "848.0000"
    assert immediate["revenue"]["net_revenue"] == "1152.0000"
    assert immediate["profit"] == "304.0000"
    assert immediate["warnings"] == []

    both_orders = _scenario(body, "buy_order", "sell_order")
    assert both_orders["costs"]["ingredient_cost"] == "720.0000"
    assert both_orders["costs"]["acquisition_setup_fee"] == "18"
    assert both_orders["costs"]["total_cost"] == "756.0000"
    assert both_orders["revenue"] == {
        "gross_revenue": "1280.0000",
        "sales_tax": "52",
        "sale_setup_fee": "32",
        "net_revenue": "1196.0000",
    }
    assert both_orders["profit"] == "440.0000"
    assert both_orders["warnings"] == ["ordem_nao_garantida"]


async def test_amount_crafted_return_focus_and_explicit_return_exception(
    cliente_autenticado, db_session
) -> None:
    await _seed_recipe(
        db_session,
        amount_crafted=5,
        ingredients=[("T2_FIBER", 3), ("T2_ARTEFACT", 2)],
        crafting_focus=20,
    )
    payload = _payload(
        quantity=11,
        return_rate="0.15",
        ingredient_overrides={"T2_ARTEFACT": {"return_eligible": False}},
        manual_prices={
            "T2_FIBER": {"offer": "10", "request": "9"},
            "T2_ARTEFACT": {"offer": "20", "request": "18"},
            "T2_CLOTH": {"offer": "30", "request": "28"},
        },
    )

    response = await cliente_autenticado.post("/craft/simulate", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["executions"], body["produced_quantity"], body["surplus_quantity"]) == (3, 15, 4)
    assert body["focus_consumed"] == 60
    fiber, artefact = body["ingredients"]
    assert fiber["gross_quantity"] == 9
    assert fiber["effective_quantity"] == "7.65"
    assert fiber["purchase_quantity"] == 8
    assert artefact["return_eligible"] is False
    assert artefact["effective_quantity"] == "6"
    assert artefact["purchase_quantity"] == 6


# --- Quem retorna vem da receita (task 4/26) ---

_PRECOS_NA_MAO = {
    "T2_FIBER": {"offer": "10", "request": "9"},
    "T2_ARTEFACT": {"offer": "20", "request": "18"},
    "T2_CLOTH": {"offer": "30", "request": "28"},
}


async def _artefato_da_receita(cliente_autenticado, db_session, **pedido) -> tuple[dict, dict]:
    # 3 execuções; a fibra consome 9 e o artefato 6. Com 50% de retorno, o artefato elegível
    # compraria 3 — é a diferença que os testes abaixo olham.
    await _seed_recipe(
        db_session,
        amount_crafted=5,
        ingredients=[("T2_FIBER", 3), ("T2_ARTEFACT", 2, False)],
    )
    response = await cliente_autenticado.post(
        "/craft/simulate",
        json=_payload(quantity=11, return_rate="0.5", manual_prices=_PRECOS_NA_MAO, **pedido),
    )
    assert response.status_code == 200, response.text
    fibra, artefato = response.json()["ingredients"]
    return fibra, artefato


async def test_quem_nao_retorna_vem_da_receita_sem_o_pedido_dizer(cliente_autenticado, db_session):
    """O dump marca o artefato com `@maxreturnamount="0"`. Antes, o `simulate_craft` supunha que
    tudo retornava e só o override do pedido corrigia — e nenhuma tela manda o override."""
    fibra, artefato = await _artefato_da_receita(cliente_autenticado, db_session)

    assert fibra["return_eligible"] is True
    assert fibra["purchase_quantity"] == 5  # 9 × 0,5 = 4,5 → 5
    assert artefato["return_eligible"] is False
    assert artefato["purchase_quantity"] == 6


async def test_override_so_de_qualidade_nao_devolve_o_retorno_ao_artefato(
    cliente_autenticado, db_session
):
    """`IngredientOverride.return_eligible` tinha padrão `True`: mandar só a qualidade de um
    ingrediente reescreveria a marca da receita e daria desconto de retorno ao artefato."""
    _, artefato = await _artefato_da_receita(
        cliente_autenticado,
        db_session,
        ingredient_overrides={"T2_ARTEFACT": {"quality_level": 1}},
    )

    assert artefato["return_eligible"] is False
    assert artefato["purchase_quantity"] == 6


async def test_override_explicito_continua_vencendo_a_receita(cliente_autenticado, db_session):
    _, artefato = await _artefato_da_receita(
        cliente_autenticado,
        db_session,
        ingredient_overrides={"T2_ARTEFACT": {"return_eligible": True}},
    )

    assert artefato["return_eligible"] is True
    assert artefato["purchase_quantity"] == 3


async def test_zero_rate_overrides_are_honored(cliente_autenticado, db_session) -> None:
    await _seed_recipe(db_session)
    payload = _payload(
        premium=False,
        sales_tax_rate="0",
        setup_fee_rate="0",
        manual_prices={
            "T2_FIBER": {"offer": "10", "request": "9"},
            "T2_CLOTH": {"offer": "20", "request": "19"},
        },
    )

    body = (await cliente_autenticado.post("/craft/simulate", json=payload)).json()

    assert body["sales_tax_rate"] == "0"
    assert body["setup_fee_rate"] == "0"
    scenario = _scenario(body, "buy_order", "sell_order")
    assert scenario["costs"]["acquisition_setup_fee"] == "0"
    assert scenario["revenue"]["sales_tax"] == "0"
    assert scenario["revenue"]["sale_setup_fee"] == "0"


async def test_full_return_needs_no_ingredient_price(cliente_autenticado, db_session) -> None:
    await _seed_recipe(db_session)
    payload = _payload(
        return_rate="1",
        station_fee_per_100_nutrition="0",
        manual_prices={"T2_CLOTH": {"offer": "20", "request": "19"}},
    )

    body = (await cliente_autenticado.post("/craft/simulate", json=payload)).json()

    ingredient = body["ingredients"][0]
    assert ingredient["purchase_quantity"] == 0
    assert ingredient["immediate_purchase"]["total"] == "0"
    assert ingredient["immediate_purchase"]["warnings"] == []
    scenario = _scenario(body, "buy_order", "immediate")
    assert scenario["costs"]["total_cost"] == "0"
    assert scenario["roi"] is None
    assert scenario["warnings"] == []


async def test_partial_depth_keeps_fill_but_nulls_dependent_totals(
    cliente_autenticado, db_session
) -> None:
    await _seed_recipe(db_session)
    db_session.add_all(
        [
            _order("T2_FIBER", "offer", "100", 2),
            _order("T2_FIBER", "request", "90", 20),
            _order("T2_CLOTH", "request", "150", 20),
            _order("T2_CLOTH", "offer", "160", 20),
        ]
    )
    await db_session.commit()

    body = (await cliente_autenticado.post("/craft/simulate", json=_payload())).json()

    quote = body["ingredients"][0]["immediate_purchase"]
    assert quote["priced_quantity"] == 2
    assert quote["total"] == "200.0000"
    assert quote["complete"] is False
    scenario = _scenario(body, "immediate", "immediate")
    assert scenario["costs"]["ingredient_cost"] is None
    assert scenario["costs"]["total_cost"] is None
    assert scenario["profit"] is None
    assert scenario["warnings"] == ["profundidade_insuficiente"]


async def test_covered_side_without_price_warns_and_propagates_null(
    cliente_autenticado, db_session, usuario
) -> None:
    await _seed_recipe(db_session)
    db_session.add_all([_scan(usuario.id, "T2_FIBER"), _scan(usuario.id, "T2_CLOTH")])
    await db_session.commit()

    body = (await cliente_autenticado.post("/craft/simulate", json=_payload())).json()

    quote = body["ingredients"][0]["immediate_purchase"]
    assert quote["warnings"] == ["sem_preco"]
    assert _scenario(body, "immediate", "immediate")["profit"] is None


async def test_stale_side_is_not_used_as_executable_price(
    cliente_autenticado, db_session, usuario
) -> None:
    await _seed_recipe(db_session)
    old = datetime.now(timezone.utc) - timedelta(days=2)
    db_session.add_all(
        [
            _scan(usuario.id, "T2_FIBER"),
            _scan(usuario.id, "T2_CLOTH"),
            _order("T2_FIBER", "offer", "100", 20, seen_at=old),
        ]
    )
    await db_session.commit()

    body = (await cliente_autenticado.post("/craft/simulate", json=_payload())).json()

    quote = body["ingredients"][0]["immediate_purchase"]
    assert quote["total"] is None
    assert quote["warnings"] == ["dado_velho"]


async def test_scope_mine_requires_collectors_own_book_coverage(
    cliente_autenticado, db_session
) -> None:
    await _seed_recipe(db_session)
    db_session.add_all(
        [
            _order("T2_FIBER", "offer", "100", 20),
            _order("T2_CLOTH", "request", "150", 20),
        ]
    )
    await db_session.commit()

    body = (await cliente_autenticado.post("/craft/simulate", json=_payload(scope="mine"))).json()

    assert body["ingredients"][0]["immediate_purchase"]["warnings"] == ["sem_cobertura"]
    scenario = _scenario(body, "immediate", "immediate")
    assert scenario["profit"] is None
    assert scenario["warnings"] == ["sem_cobertura"]


async def test_scope_mine_uses_global_book_after_own_coverage(
    cliente_autenticado, db_session, usuario
) -> None:
    await _seed_recipe(db_session)
    db_session.add_all(
        [
            _scan(usuario.id, "T2_FIBER"),
            _scan(usuario.id, "T2_CLOTH"),
            _order("T2_FIBER", "offer", "100", 20),
            _order("T2_FIBER", "request", "90", 20),
            _order("T2_CLOTH", "request", "150", 20),
            _order("T2_CLOTH", "offer", "160", 20),
        ]
    )
    await db_session.commit()

    body = (await cliente_autenticado.post("/craft/simulate", json=_payload(scope="mine"))).json()

    assert body["ingredients"][0]["immediate_purchase"]["source"] == "book"
    assert _scenario(body, "immediate", "immediate")["profit"] is not None


async def test_server_is_forwarded_to_every_book_query(cliente_autenticado, db_session) -> None:
    await _seed_recipe(db_session)
    db_session.add_all(
        [
            _order("T2_FIBER", "offer", "100", 20, server="west"),
            _order("T2_CLOTH", "request", "150", 20, server="west"),
        ]
    )
    await db_session.commit()

    body = (await cliente_autenticado.post("/craft/simulate", json=_payload(server="east"))).json()

    assert body["server"] == "east"
    assert body["ingredients"][0]["immediate_purchase"]["warnings"] == ["sem_cobertura"]
    assert _scenario(body, "immediate", "immediate")["profit"] is None


async def test_manual_prices_replace_missing_book_and_quality_override_is_explicit(
    cliente_autenticado, db_session
) -> None:
    await _seed_recipe(db_session)
    payload = _payload(
        ingredient_overrides={"T2_FIBER": {"quality_level": 3}},
        manual_prices={
            "T2_FIBER": {"offer": "10.25", "request": "9.5"},
            "T2_CLOTH": {"offer": "20.5", "request": "19.75"},
        },
    )

    body = (await cliente_autenticado.post("/craft/simulate", json=payload)).json()

    ingredient = body["ingredients"][0]
    assert ingredient["quality_level"] == 3
    assert ingredient["immediate_purchase"]["source"] == "manual"
    assert ingredient["immediate_purchase"]["total"] == "82.00"
    assert all(scenario["profit"] is not None for scenario in body["scenarios"])
    assert _scenario(body, "buy_order", "sell_order")["warnings"] == ["ordem_nao_garantida"]


async def test_semantic_404_and_validation_errors(cliente_autenticado, db_session) -> None:
    db_session.add(_item("T2_HIDE", 990_000))
    await db_session.commit()

    missing = await cliente_autenticado.post(
        "/craft/simulate", json=_payload(output_item="DOES_NOT_EXIST")
    )
    unavailable = await cliente_autenticado.post(
        "/craft/simulate", json=_payload(output_item="T2_HIDE")
    )
    invalid = await cliente_autenticado.post("/craft/simulate", json=_payload(quantity=0))

    assert (missing.status_code, missing.json()["detail"]) == (404, "item_nao_encontrado")
    assert (unavailable.status_code, unavailable.json()["detail"]) == (
        404,
        "receita_indisponivel",
    )
    assert invalid.status_code == 422


async def test_unknown_manual_or_ingredient_override_is_rejected(
    cliente_autenticado, db_session
) -> None:
    await _seed_recipe(db_session)

    response = await cliente_autenticado.post(
        "/craft/simulate",
        json=_payload(manual_prices={"TYPO_ITEM": {"offer": "10"}}),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "override_invalido"


async def test_query_count_does_not_grow_with_ingredient_count(db_session, usuario) -> None:
    ingredients = [(f"T2_QUERY_INGREDIENT_{index}", 1) for index in range(12)]
    await _seed_recipe(db_session, ingredients=ingredients)
    manual_prices = {unique_name: {"offer": "10", "request": "9"} for unique_name, _ in ingredients}
    manual_prices["T2_CLOTH"] = {"offer": "20", "request": "19"}
    request = CraftSimulationRequest.model_validate(
        _payload(quantity=1, manual_prices=manual_prices)
    )
    selects = []

    def _on_execute(conn, cursor, statement, parameters, context, executemany):
        if "SELECT" in statement.upper():
            selects.append(statement)

    event.listen(db_engine.sync_engine, "before_cursor_execute", _on_execute)
    try:
        result = await simulate_craft(db_session, request, usuario.id)
    finally:
        event.remove(db_engine.sync_engine, "before_cursor_execute", _on_execute)

    assert len(result["ingredients"]) == 12
    assert len(selects) <= 5


async def test_taxa_da_estacao_sai_da_nutricao_e_nao_de_prata_fixa(
    cliente_autenticado, db_session
) -> None:
    """Task 4/18. A estação cobra por **nutrição consumida**, não por execução.

    O número de referência veio da estação aberta no jogo: taxa de uso 390 por 100 de nutrição
    refinando um item de valor 64 custa 28 — e não 390. Sem isto a tela cobrava a taxa cheia por
    execução, o que num recurso T4 dava 56× a mais e numa arma T8, 9× a menos.
    """
    await _seed_recipe(db_session, item_value="64")
    db_session.add_all(
        [
            _order("900001", "offer", "10", 1_000),
            _order("900000", "request", "500", 1_000),
        ]
    )
    await db_session.commit()

    payload = _payload(quantity=1, station_fee_per_100_nutrition="390")
    body = (await cliente_autenticado.post("/craft/simulate", json=payload)).json()

    # 64 × 0,1125 = 7,2 de nutrição; 7,2 × 390/100 = 28,08.
    assert body["scenarios"][0]["costs"]["station_cost"] == "28.08"


async def test_sem_valor_de_item_a_estacao_nao_cobra(cliente_autenticado, db_session) -> None:
    """Os trade packs de facção não têm valor em ponto nenhum da cadeia. Cobrar uma taxa
    arbitrária ali inventaria custo para uma linha que ninguém consegue vender."""
    await _seed_recipe(db_session, item_value=None)
    db_session.add_all(
        [
            _order("900001", "offer", "10", 1_000),
            _order("900000", "request", "500", 1_000),
        ]
    )
    await db_session.commit()

    payload = _payload(quantity=1, station_fee_per_100_nutrition="390")
    body = (await cliente_autenticado.post("/craft/simulate", json=payload)).json()

    assert body["scenarios"][0]["costs"]["station_cost"] == "0"
