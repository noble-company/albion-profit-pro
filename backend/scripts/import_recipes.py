"""Invocação canônica: `uv run python -m scripts.import_recipes` (de dentro de `backend/`).
Rodar como `python scripts/import_recipes.py` direto falha com `ModuleNotFoundError: No
module named 'src'` — o pacote `src` só entra no `sys.path` quando `backend/` é a raiz do
módulo executado (`-m`), não quando o script roda solto.

Reimportável (task 35, achado M4): `recipe`/`recipe_ingredient` são 100% derivados de
`ITEM DUMP.json`/`items.json`, sem `id` estável entre execuções e sem nada de fora
referenciando por FK — apagar tudo e reimportar dentro de uma transação é seguro e mais
fácil de raciocinar que upsert por `output_item_unique_name`.
"""

import asyncio
import os
from pathlib import Path

import structlog
from sqlalchemy import delete

from scripts._dumps import as_list, iter_category_entries, load_item_dump_items, load_items_json
from src.database import async_session_maker
from src.logging_config import configure_logging
from src.recipes.models import Recipe, RecipeIngredient

configure_logging()
log = structlog.get_logger()

RAIZ_PROJETO = Path(__file__).resolve().parents[2]  # backend/scripts/x.py -> raiz do repo
ITEM_DUMP_PATH = Path(os.getenv("ITEM_DUMP_PATH", RAIZ_PROJETO / "ITEM DUMP.json"))
ITEMS_JSON_PATH = Path(os.getenv("ITEMS_JSON_PATH", RAIZ_PROJETO / "items.json"))


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
        }
        for r in resources
    ]


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
) -> Recipe | None:
    """Monta uma Recipe (+ ingredientes) pra uma combinação (item, nível de
    encantamento). Retorna None se `requirements` for uma lista (receita
    alternativa/múltipla — ver docs/02, não modelável ainda), registrando em
    `skipped_multi_recipe`.
    """
    if isinstance(requirements, list):
        skipped_multi_recipe.append(output_unique_name)
        return None

    output_item_id = name_to_id.get(output_unique_name)
    if output_item_id is None:
        not_found.append(output_unique_name)

    recipe = Recipe(
        output_item_unique_name=output_unique_name,
        output_item_id=output_item_id,
        enchantment_level=enchantment_level,
        silver_cost=int(requirements.get("@silver", 0)),
        crafting_focus=int(requirements.get("@craftingfocus", 0)),
        amount_crafted=int(requirements.get("@amountcrafted", 1)),
        craft_time=float(requirements.get("@time", 0)),
    )
    if upgrade_resource is not None:
        upgrade_unique_name = upgrade_resource["@uniquename"]
        recipe.upgrade_resource_unique_name = upgrade_unique_name
        recipe.upgrade_resource_item_id = name_to_id.get(upgrade_unique_name)
        recipe.upgrade_resource_count = int(upgrade_resource["@count"])

    for resource in extract_craft_resources(requirements):
        recipe.ingredients.append(
            RecipeIngredient(
                ingredient_unique_name=resource["unique_name"],
                ingredient_item_id=name_to_id.get(resource["unique_name"]),
                count=resource["count"],
                enchantment_level=resource["enchantment_level"],
            )
        )
    return recipe


async def import_recipes() -> None:
    dump_items = load_item_dump_items(ITEM_DUMP_PATH)
    name_to_id = load_unique_name_to_id(ITEMS_JSON_PATH)

    not_found: list[str] = []
    skipped_multi_recipe: list[str] = []

    async with async_session_maker() as session:
        # Apaga tudo e reimporta na mesma transação (task 35) — ver docstring do módulo.
        await session.execute(delete(RecipeIngredient))
        await session.execute(delete(Recipe))

        for entry, requirements in iter_craftable_items(dump_items):
            base_unique_name = entry["@uniquename"]

            base_recipe = build_recipe(
                base_unique_name,
                requirements,
                enchantment_level=0,
                upgrade_resource=None,  # nada a upgradar pro nível 0
                name_to_id=name_to_id,
                not_found=not_found,
                skipped_multi_recipe=skipped_multi_recipe,
            )
            if base_recipe is not None:
                session.add(base_recipe)

            # Variações encantadas (@1-@4) — craftar o item já encantado
            # direto, com ingredientes pré-encantados (equipamento/arma) ou um
            # ingrediente extra (consumível, ex: extrato de alquimia). Ver
            # docs/02-dados-de-receita.md.
            enchantments = entry.get("enchantments")
            if enchantments is None:
                continue

            for level_block in as_list(enchantments.get("enchantment")):
                level = int(level_block["@enchantmentlevel"])
                level_unique_name = f"{base_unique_name}@{level}"
                level_requirements = level_block.get("craftingrequirements")
                if level_requirements is None:
                    continue  # não deveria acontecer (visto no dump real: sempre presente), mas não é motivo pra travar o import

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
                )
                if level_recipe is not None:
                    session.add(level_recipe)

        await session.commit()

    log.info(
        "import_recipes.concluido",
        nao_encontrados=len(not_found),
        nao_encontrados_amostra=not_found[:20],
        receitas_multiplas_puladas=len(skipped_multi_recipe),
        receitas_multiplas_puladas_amostra=skipped_multi_recipe[:20],
    )


if __name__ == "__main__":
    asyncio.run(import_recipes())
