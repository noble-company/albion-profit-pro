"""Task 4/26 — a comparação entre cidades também tira da receita quem não retorna.

`_ingredient_needs` supunha `return_eligible = True` sem override, igual ao `simulate_craft`. As
duas rotas do servidor precisam concordar com o dump: artefato não tem desconto de retorno.
"""

from decimal import Decimal

from src.craft.compare_service import _ingredient_needs
from src.craft.schemas import CraftCompareRequest
from src.recipes.models import Recipe, RecipeIngredient


def _receita() -> Recipe:
    receita = Recipe(output_item_unique_name="T2_CLOTH", amount_crafted=1, craft_time=Decimal("0"))
    receita.ingredients.extend(
        [
            RecipeIngredient(
                ingredient_unique_name="T2_FIBER", count=3, position=0, return_eligible=True
            ),
            RecipeIngredient(
                ingredient_unique_name="T2_ARTEFACT", count=2, position=1, return_eligible=False
            ),
        ]
    )
    return receita


def _pedido(**extra) -> CraftCompareRequest:
    return CraftCompareRequest(
        server="west", output_item="T2_CLOTH", quantity=3, return_rate=Decimal("0.5"), **extra
    )


def test_comparacao_tira_da_receita_quem_nao_retorna():
    fibra, artefato = _ingredient_needs(_receita(), 3, _pedido())

    assert fibra.quantity == 5  # 9 × 0,5 = 4,5 → 5
    assert artefato.quantity == 6  # sem desconto


def test_override_so_de_qualidade_mantem_a_marca_da_receita():
    _, artefato = _ingredient_needs(
        _receita(), 3, _pedido(ingredient_overrides={"T2_ARTEFACT": {"quality_level": 1}})
    )

    assert artefato.quantity == 6
