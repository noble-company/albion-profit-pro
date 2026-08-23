# 19 — Script de import de receitas

## Objetivo
`scripts/import_recipes.py` — lê `ITEM DUMP.json` (receitas) + `items.json` (nomes/IDs), faz o join por nome único, e popula `Recipe`/`RecipeIngredient` (task 12) com o ID numérico já resolvido.

## Por que
Como documentado em [docs/02-dados-de-receita.md](../../02-dados-de-receita.md), os dois arquivos não compartilham um ID numérico — só o nome em texto (`UniqueName` em `items.json` ↔ `@uniquename` em `ITEM DUMP.json`). Resolver esse join uma vez no import (em vez de em toda consulta da calculadora) mantém as leituras da API simples e rápidas.

## O que implementar
`scripts/import_recipes.py`:
```python
import asyncio
import json
from pathlib import Path

from src.database import async_session_maker
from src.recipes.models import Recipe, RecipeIngredient

ITEM_DUMP_PATH = Path("../ITEM DUMP.json")  # ajustar caminho relativo conforme onde o arquivo acabar morando (ver pendência no plano macro)
ITEMS_JSON_PATH = Path("../items.json")

RELEVANT_CATEGORIES = ["simpleitem", "equipmentitem", "weapon", "consumableitem"]  # ver docs/02-dados-de-receita.md


def load_unique_name_to_id(items_json_path: Path) -> dict[str, int]:
    data = json.loads(items_json_path.read_text(encoding="utf-8"))
    return {item["UniqueName"]: int(item["Index"]) for item in data if "UniqueName" in item and "Index" in item}


def extract_craft_resources(craftingrequirements: dict) -> list[dict]:
    resource = craftingrequirements.get("craftresource")
    if resource is None:
        return []
    resources = resource if isinstance(resource, list) else [resource]  # objeto único OU array — ver docs/02
    return [
        {
            "unique_name": r["@uniquename"],
            "count": int(r["@count"]),
            "enchantment_level": int(r.get("@enchantmentlevel", 0)),
        }
        for r in resources
    ]


def iter_craftable_items(dump: dict):
    items = dump["items"]
    for category in RELEVANT_CATEGORIES:
        entries = items.get(category, [])
        entries = entries if isinstance(entries, list) else [entries]
        for entry in entries:
            requirements = entry.get("craftingrequirements")
            if requirements is None:
                continue  # item não craftável (ex: loot-only)
            yield entry, requirements


async def import_recipes() -> None:
    dump = json.loads(ITEM_DUMP_PATH.read_text(encoding="utf-8"))
    name_to_id = load_unique_name_to_id(ITEMS_JSON_PATH)

    not_found: list[str] = []

    async with async_session_maker() as session:
        for entry, requirements in iter_craftable_items(dump):
            output_unique_name = entry["@uniquename"]
            output_item_id = name_to_id.get(output_unique_name)
            if output_item_id is None:
                not_found.append(output_unique_name)

            recipe = Recipe(
                output_item_unique_name=output_unique_name,
                output_item_id=output_item_id,
                silver_cost=int(requirements.get("@silver", 0)),
                crafting_focus=int(requirements.get("@craftingfocus", 0)),
                amount_crafted=int(requirements.get("@amountcrafted", 1)),
                craft_time=float(requirements.get("@time", 0)),
            )
            for resource in extract_craft_resources(requirements):
                recipe.ingredients.append(
                    RecipeIngredient(
                        ingredient_unique_name=resource["unique_name"],
                        ingredient_item_id=name_to_id.get(resource["unique_name"]),
                        count=resource["count"],
                        enchantment_level=resource["enchantment_level"],
                    )
                )
            session.add(recipe)

        await session.commit()

    print(f"Import concluído. {len(not_found)} itens sem ID numérico correspondente em items.json:")
    for name in not_found[:20]:
        print(f"  - {name}")
    if len(not_found) > 20:
        print(f"  ... e mais {len(not_found) - 20}")


if __name__ == "__main__":
    asyncio.run(import_recipes())
```

Notas de implementação:
- Rodar **uma vez manualmente** — não é parte do fluxo de request/response nem do worker. Se o jogo tiver um patch que mude receitas, roda de novo (com `TRUNCATE recipe_ingredient, recipe RESTART IDENTITY CASCADE;` antes, já que `output_item_unique_name` é `UNIQUE` — rodar sem truncar antes quebra com conflito de chave).
- **Rodar como módulo, não como script solto**: `uv run python scripts/import_recipes.py` direto falha com `ModuleNotFoundError: No module named 'src'` (o Python só põe o diretório do próprio script em `sys.path`, não o cwd). Comando real: `uv run python -m scripts.import_recipes` (de dentro de `backend/`).
- `not_found` logado no final — itens sem correspondência em `items.json` (nomes descontinuados/beta) não travam o import inteiro, só ficam sem `output_item_id` resolvido (nullable, task 12).
- **Achado real, fora do que a spec original previa**: `craftingrequirements` pode ser uma **lista** de receitas alternativas (não só um objeto único) — 799 dos 3088 itens craftáveis nas categorias relevantes, e também 2420 dos 5684 níveis de encantamento (mesmo padrão) (ver [docs/02-dados-de-receita.md](../../02-dados-de-receita.md)). Não modelável com o schema atual (`output_item_unique_name` é `UNIQUE`) — esses itens/níveis são pulados e logados separado (`skipped_multi_recipe`), não misturados com `not_found`.
- Confirmar o caminho final de `ITEM DUMP.json`/`items.json` antes de rodar — pendência registrada no plano macro (hoje estão na raiz do projeto, fora de `backend/`).

### Revisão 2026-08-21 — receitas encantadas (`enchantments`) + custo de upgrade

Pedido do usuário: além da receita base (`enchantment_level=0`), importar também as variações encantadas (craftar já encantado direto) e o custo de upgrade (craftar base + upgradar), pra viabilizar a pergunta "vale mais a pena comprar encantado, craftar encantado, ou craftar base e upgradar?".

`import_recipes()` foi reestruturado: pra cada item craftável, além da `Recipe` base, itera `entry.get("enchantments", {}).get("enchantment", [])` (normalizado objeto único → lista) e monta uma `Recipe` adicional por nível (`output_item_unique_name = "{base}@{nivel}"`, `enchantment_level={nivel}`), com `upgrade_resource_*` preenchido a partir de `upgraderequirements.upgraderesource` (sempre objeto único no dump real, nunca lista — confirmado). A lógica de "pular se `craftingrequirements` for lista" (achado acima) passou a ser aplicada por (item, nível) independentemente — extraída pra uma função `build_recipe()` reusada nos dois casos, em vez de duplicar a lógica.

Resultado real (dump de 2026-08-21): **5553 receitas** no total (2289 base + 3264 níveis de encantamento), **3219 itens/níveis pulados** por receita múltipla (799 base + 2420 encantamento), **78 sem correspondência em items.json**.

Exige a migration `42c9111202e7` (task 12, revisão 2026-08-21) — rodar `uv run alembic upgrade head` antes de reimportar. Como `output_item_unique_name` é `UNIQUE`, reimportar sem truncar antes quebra com conflito de chave: `TRUNCATE recipe_ingredient, recipe RESTART IDENTITY CASCADE;` antes de rodar de novo.

## Bibliotecas/dependências
Nenhuma nova — só `json`/`pathlib`, stdlib.

## Depende de
Task 12 (`Recipe`/`RecipeIngredient`), Task 05 (banco).

## Testes manuais
1. `uv run python scripts/import_recipes.py` → roda sem erro, imprime contagem de itens não resolvidos.
2. `SELECT COUNT(*) FROM recipe` → deve bater com a quantidade de itens craftáveis nas categorias relevantes.
3. Conferir manualmente a receita do T2_CLOTH/T3_CLOTH (exemplos do docs/02) no banco — confirma que o join e os ingredientes batem com o esperado.

## Testes automatizados
- `tests/recipes/test_import_recipes.py`: roda o import contra um recorte pequeno de JSON de teste (fixture com 2-3 itens conhecidos, não o dump de 17MB inteiro) e confirma que `Recipe`/`RecipeIngredient` são criados corretamente, incluindo o caso de item sem correspondência em `items.json` (campo `output_item_id` deve ficar `None`, sem quebrar o import).
