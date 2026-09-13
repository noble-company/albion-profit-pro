"""Invocação canônica: `uv run python -m scripts.import_recipes` (de dentro de `backend/`).
Rodar como `python scripts/import_recipes.py` direto falha com `ModuleNotFoundError: No
module named 'src'` — o pacote `src` só entra no `sys.path` quando `backend/` é a raiz do
módulo executado (`-m`), não quando o script roda solto.

Reimportável: `recipe`/`recipe_ingredient` são 100% derivados de
`ITEM DUMP.json`/`items.json`, sem `id` estável entre execuções e sem nada de fora
referenciando por FK — apagar tudo e reimportar dentro de uma transação é seguro e mais
fácil de raciocinar que upsert por `output_item_unique_name`.
"""

import asyncio
import os
import re
from dataclasses import dataclass
from pathlib import Path

import structlog
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from scripts._dumps import as_list, iter_category_entries, load_item_dump_items, load_items_json
from src.database import async_session_maker
from src.logging_config import configure_logging
from src.recipes.models import Recipe, RecipeIngredient

configure_logging()
log = structlog.get_logger()

RAIZ_PROJETO = Path(__file__).resolve().parents[2]  # backend/scripts/x.py -> raiz do repo
ITEM_DUMP_PATH = Path(os.getenv("ITEM_DUMP_PATH", RAIZ_PROJETO / "ITEM DUMP.json"))
ITEMS_JSON_PATH = Path(os.getenv("ITEMS_JSON_PATH", RAIZ_PROJETO / "items.json"))
ENCHANTED_RESOURCE_SUFFIX = re.compile(r"_LEVEL(?P<level>[1-4])$")
REFINED_RESOURCE_SUBCATEGORY = "refinedresources"


@dataclass(frozen=True)
class RecipeImportPlan:
    recipes: list[Recipe]
    not_found: list[str]
    skipped_multi_recipe: list[str]


def load_unique_name_to_id(items_json_path: Path) -> dict[str, int]:
    return {
        item["UniqueName"]: int(item["Index"])
        for item in load_items_json(items_json_path)
        if "UniqueName" in item and "Index" in item
    }


def extract_craft_resources(craftingrequirements: dict) -> list[dict]:
    resources = as_list(craftingrequirements.get("craftresource"))
    return [
        {
            "unique_name": r["@uniquename"],
            "count": int(r["@count"]),
            "enchantment_level": int(r.get("@enchantmentlevel", 0)),
            # `@maxreturnamount="0"`: o jogo não devolve no retorno de recurso (task 4/26). O
            # atributo só aparece com esse valor; sem ele, o ingrediente retorna.
            "return_eligible": r.get("@maxreturnamount") != "0",
        }
        for r in resources
    ]


def select_standard_refining_requirements(requirements: dict | list[dict]) -> dict | None:
    """Escolhe a rota normal quando um recurso refinado também oferece rota de facção.

    O dump representa esses refinos como alternativas para o mesmo output: a receita normal e
    outra que troca uma unidade da matéria-prima por um token de facção. O ranking principal deve
    usar a rota normal; a rota com token continua fora do escopo até o modelo suportar variantes.
    """
    if isinstance(requirements, dict):
        return requirements

    standard_routes = []
    for candidate in requirements:
        resources = extract_craft_resources(candidate)
        uses_faction_token = any(
            "_FACTION_" in resource["unique_name"] and "_TOKEN_" in resource["unique_name"]
            for resource in resources
        )
        if not uses_faction_token:
            standard_routes.append(candidate)
    return standard_routes[0] if len(standard_routes) == 1 else None


ARTIFACT_FAVOR_TOKEN = "_ARTEFACT_TOKEN_FAVOR_"


def select_artifact_route(requirements: dict | list[dict]) -> dict | None:
    """Escolhe a receita do artefato quando o equipamento de facção também aceita token de favor
    (task 4/27).

    O dump traz as duas como alternativas do mesmo output: uma com o artefato do item, outra que
    troca o artefato por um token de favor (`T6_ARTEFACT_TOKEN_FAVOR_3`). O catálogo guarda uma
    receita por output, e a do artefato é a que se compra no mercado.

    Os outros casos de várias receitas não são essa troca e continuam fora (`None`): peça Royal a
    partir de três sets, peixe picado por tipo de peixe, transmutação de recurso bruto, conversão
    de alma. Escolher um deles arbitrariamente daria um custo que depende do que o jogador tem.
    """
    if isinstance(requirements, dict):
        return requirements

    def usa(route: dict, fragmento: str) -> bool:
        return any(fragmento in r["unique_name"] for r in extract_craft_resources(route))

    if not any(usa(route, ARTIFACT_FAVOR_TOKEN) for route in requirements):
        return None
    artifact_routes = [
        route
        for route in requirements
        if not usa(route, ARTIFACT_FAVOR_TOKEN) and usa(route, "_ARTEFACT_")
    ]
    return artifact_routes[0] if len(artifact_routes) == 1 else None


def canonical_item_unique_name(
    source_unique_name: str,
    enchantment_level: int,
    name_to_id: dict[str, int],
) -> tuple[str, int]:
    """Resolve a diferença entre o dump XML e a chave canônica do mercado.

    Certos recursos encantados aparecem como ``T4_CLOTH_LEVEL1`` no ITEM DUMP, mas como
    ``T4_CLOTH_LEVEL1@1`` no items.json/mercado. Só aplicamos o sufixo quando a chave candidata
    existe na fonte canônica, evitando inventar identificadores.
    """
    if source_unique_name in name_to_id:
        return source_unique_name, enchantment_level

    inferred_level = enchantment_level
    if inferred_level == 0:
        match = ENCHANTED_RESOURCE_SUFFIX.search(source_unique_name)
        inferred_level = int(match.group("level")) if match else 0

    candidate = f"{source_unique_name}@{inferred_level}"
    if inferred_level > 0 and candidate in name_to_id:
        return candidate, inferred_level
    return source_unique_name, enchantment_level


def iter_craftable_items(items: dict):
    for entry in iter_category_entries(items):
        requirements = entry.get("craftingrequirements")
        if requirements is None:
            continue  # item não craftável (ex: loot-only)
        yield entry, requirements


def build_recipe(
    output_unique_name: str,
    requirements,
    enchantment_level: int,
    upgrade_resource: dict | None,
    name_to_id: dict[str, int],
    not_found: list[str],
    skipped_multi_recipe: list[str],
    prefer_standard_refining_route: bool = False,
    production_kind: str = "crafting",
) -> Recipe | None:
    """Monta uma Recipe (+ ingredientes) pra uma combinação (item, nível de
    encantamento). Retorna None se `requirements` for uma lista (receita
    alternativa/múltipla — ver docs/02, não modelável ainda), registrando em
    `skipped_multi_recipe`.
    """
    canonical_output, canonical_level = canonical_item_unique_name(
        output_unique_name, enchantment_level, name_to_id
    )
    if isinstance(requirements, list):
        selected_requirements = (
            select_standard_refining_requirements(requirements)
            if prefer_standard_refining_route
            else select_artifact_route(requirements)
        )
        if selected_requirements is None:
            skipped_multi_recipe.append(canonical_output)
            return None
        requirements = selected_requirements

    output_item_id = name_to_id.get(canonical_output)
    if output_item_id is None:
        not_found.append(canonical_output)

    recipe = Recipe(
        output_item_unique_name=canonical_output,
        output_item_id=output_item_id,
        enchantment_level=canonical_level,
        silver_cost=int(requirements.get("@silver", 0)),
        crafting_focus=int(requirements.get("@craftingfocus", 0)),
        amount_crafted=int(requirements.get("@amountcrafted", 1)),
        craft_time=float(requirements.get("@time", 0)),
        production_kind=production_kind,
    )
    if upgrade_resource is not None:
        upgrade_unique_name = upgrade_resource["@uniquename"]
        recipe.upgrade_resource_unique_name = upgrade_unique_name
        recipe.upgrade_resource_item_id = name_to_id.get(upgrade_unique_name)
        recipe.upgrade_resource_count = int(upgrade_resource["@count"])

    for position, resource in enumerate(extract_craft_resources(requirements)):
        ingredient_unique_name, ingredient_level = canonical_item_unique_name(
            resource["unique_name"], resource["enchantment_level"], name_to_id
        )
        recipe.ingredients.append(
            RecipeIngredient(
                ingredient_unique_name=ingredient_unique_name,
                ingredient_item_id=name_to_id.get(ingredient_unique_name),
                count=resource["count"],
                enchantment_level=ingredient_level,
                position=position,
                # Explícito: o `default` da coluna só entra no flush, e o plano é lido antes.
                return_eligible=resource["return_eligible"],
            )
        )
    return recipe


def prepare_recipe_import(
    item_dump_path: Path = ITEM_DUMP_PATH, items_json_path: Path = ITEMS_JSON_PATH
) -> RecipeImportPlan:
    dump_items = load_item_dump_items(item_dump_path)
    name_to_id = load_unique_name_to_id(items_json_path)

    not_found: list[str] = []
    skipped_multi_recipe: list[str] = []
    recipes: list[Recipe] = []

    for entry, requirements in iter_craftable_items(dump_items):
        base_unique_name = entry["@uniquename"]
        # `B11`: refino x fabricação vem do `@shopsubcategory1 == "refinedresources"` do dump
        # (o mesmo sinal já usado para a rota de refino padrão), não de substring em tempo de
        # consulta. Recursos refinados (barra, tábua, tecido, couro, bloco) são o único caso.
        is_refined_resource = entry.get("@shopsubcategory1") == REFINED_RESOURCE_SUBCATEGORY
        production_kind = "refining" if is_refined_resource else "crafting"

        base_recipe = build_recipe(
            base_unique_name,
            requirements,
            enchantment_level=0,
            upgrade_resource=None,
            name_to_id=name_to_id,
            not_found=not_found,
            skipped_multi_recipe=skipped_multi_recipe,
            prefer_standard_refining_route=is_refined_resource,
            production_kind=production_kind,
        )
        if base_recipe is not None:
            recipes.append(base_recipe)

        enchantments = entry.get("enchantments")
        if enchantments is None:
            continue

        for level_block in as_list(enchantments.get("enchantment")):
            level = int(level_block["@enchantmentlevel"])
            level_unique_name = f"{base_unique_name}@{level}"
            level_requirements = level_block.get("craftingrequirements")
            if level_requirements is None:
                continue

            upgrade_requirements = level_block.get("upgraderequirements")
            upgrade_resource = (
                upgrade_requirements.get("upgraderesource")
                if upgrade_requirements is not None
                else None
            )

            level_recipe = build_recipe(
                level_unique_name,
                level_requirements,
                enchantment_level=level,
                upgrade_resource=upgrade_resource,
                name_to_id=name_to_id,
                not_found=not_found,
                skipped_multi_recipe=skipped_multi_recipe,
                prefer_standard_refining_route=is_refined_resource,
                production_kind=production_kind,
            )
            if level_recipe is not None:
                recipes.append(level_recipe)

    return RecipeImportPlan(recipes, not_found, skipped_multi_recipe)


async def apply_recipe_import(session: AsyncSession, plan: RecipeImportPlan) -> None:
    await session.execute(delete(RecipeIngredient))
    await session.execute(delete(Recipe))
    session.add_all(plan.recipes)
    await session.flush()


async def import_recipes() -> None:
    plan = prepare_recipe_import(ITEM_DUMP_PATH, ITEMS_JSON_PATH)

    async with async_session_maker() as session:
        await apply_recipe_import(session, plan)
        await session.commit()

    log.info(
        "import_recipes.concluido",
        receitas_importadas=len(plan.recipes),
        nao_encontrados=len(plan.not_found),
        nao_encontrados_amostra=plan.not_found[:20],
        receitas_multiplas_puladas=len(plan.skipped_multi_recipe),
        receitas_multiplas_puladas_amostra=plan.skipped_multi_recipe[:20],
    )


if __name__ == "__main__":
    asyncio.run(import_recipes())
