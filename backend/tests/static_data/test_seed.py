import asyncio
import hashlib
import json
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import func, select, text

import scripts.seed_static_data as seed_module
from alembic import command
from scripts.seed_static_data import DatasetValidationError, seed_static_data
from src.database import async_session_maker
from src.items.models import Item, Location
from src.recipes.models import Recipe, RecipeIngredient
from src.static_data.constants import STATIC_TRANSFORM_REVISION
from src.static_data.models import StaticDatasetVersion


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_dataset(tmp_path: Path, *, expected_overrides: dict | None = None):
    dataset_dir = tmp_path / "dataset"
    dataset_dir.mkdir()
    items_path = dataset_dir / "items.json"
    dump_path = dataset_dir / "ITEM DUMP.json"
    world_path = dataset_dir / "world.json"

    items_path.write_text(
        json.dumps(
            [
                {"UniqueName": "ZZSEED_FIBER", "Index": "910001"},
                {"UniqueName": "ZZSEED_CATALYST", "Index": "910003"},
                {"UniqueName": "ZZSEED_CLOTH", "Index": "910002"},
            ]
        ),
        encoding="utf-8",
    )
    dump_path.write_text(
        json.dumps(
            {
                "items": {
                    "simpleitem": [
                        {"@uniquename": "ZZSEED_FIBER", "@tier": "2"},
                        {"@uniquename": "ZZSEED_CATALYST", "@tier": "2"},
                        {
                            "@uniquename": "ZZSEED_CLOTH",
                            "@tier": "2",
                            "@shopsubcategory1": "refinedresources",
                            "craftingrequirements": {
                                "@amountcrafted": "1",
                                "craftresource": [
                                    {"@uniquename": "ZZSEED_FIBER", "@count": "1"},
                                    {"@uniquename": "ZZSEED_CATALYST", "@count": "2"},
                                ],
                            },
                        },
                    ]
                }
            }
        ),
        encoding="utf-8",
    )
    world_path.write_text(
        json.dumps(
            [
                {"Index": "3005", "UniqueName": "Caerleon Market"},
                {"Index": "2004", "UniqueName": "Bridgewatch Market"},
                {"Index": "4002", "UniqueName": "Fort Sterling Market"},
                {"Index": "1002", "UniqueName": "Lymhurst Market"},
                {"Index": "3008", "UniqueName": "Martlock Market"},
                {"Index": "0007", "UniqueName": "Thetford Market"},
                {"Index": "5003", "UniqueName": "Brecilien Market"},
            ]
        ),
        encoding="utf-8",
    )

    expected = {
        "source_items": 3,
        "imported_items": 3,
        "skipped_long_item_names": 0,
        "recipes": 1,
        "skipped_multiple_recipes": 0,
        "recipes_without_item_id": 0,
        "curated_locations": 8,
    }
    expected.update(expected_overrides or {})
    manifest = {
        "schema_version": 2,
        "dataset_name": "test-static-data",
        "version": "fixture-v1",
        "transform_revision": STATIC_TRANSFORM_REVISION,
        "source": {
            "repository": "https://example.com/source",
            "revision": "a" * 40,
        },
        "files": {
            "items": {
                "filename": items_path.name,
                "url": "https://example.com/items.json",
                "size": items_path.stat().st_size,
                "sha256": _sha256(items_path),
            },
            "item_dump": {
                "filename": dump_path.name,
                "url": "https://example.com/item-dump.json",
                "size": dump_path.stat().st_size,
                "sha256": _sha256(dump_path),
            },
            "world": {
                "filename": world_path.name,
                "url": "https://example.com/world.json",
                "size": world_path.stat().st_size,
                "sha256": _sha256(world_path),
            },
        },
        "locations": {
            "confirmed_market_ids": [
                "3005",
                "2004",
                "4002",
                "1002",
                "3008",
                "0007",
                "5003",
                "3003",
            ],
            "royal_city_ids": ["3005", "2004", "4002", "1002", "3008", "0007"],
        },
        "expected": expected,
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_path, dataset_dir


async def _add_old_catalog(db_session):
    db_session.add(Item(unique_name="ZZOLD_ITEM", albion_id=919999))
    recipe = Recipe(output_item_unique_name="ZZOLD_RECIPE", output_item_id=919999)
    recipe.ingredients.append(
        RecipeIngredient(
            ingredient_unique_name="ZZOLD_ITEM",
            ingredient_item_id=919999,
            count=1,
            position=0,
        )
    )
    db_session.add(recipe)
    await db_session.commit()
    return recipe.id


async def test_dataset_ausente_nao_altera_catalogo_valido(tmp_path, db_session):
    manifest_path, _ = _write_dataset(tmp_path)
    old_recipe_id = await _add_old_catalog(db_session)

    with pytest.raises(DatasetValidationError, match="Dataset ausente"):
        await seed_static_data(manifest_path, tmp_path / "vazio")

    assert await db_session.get(Item, "ZZOLD_ITEM") is not None
    assert await db_session.get(Recipe, old_recipe_id) is not None


async def test_checksum_errado_falha_antes_de_apagar_dados(tmp_path, db_session):
    manifest_path, dataset_dir = _write_dataset(tmp_path)
    old_recipe_id = await _add_old_catalog(db_session)
    (dataset_dir / "items.json").write_text("[]", encoding="utf-8")

    with pytest.raises(DatasetValidationError, match="Tamanho inesperado|SHA-256 inesperado"):
        await seed_static_data(manifest_path, dataset_dir)

    assert await db_session.get(Item, "ZZOLD_ITEM") is not None
    assert await db_session.get(Recipe, old_recipe_id) is not None


async def test_contagem_inesperada_falha_antes_de_apagar_dados(tmp_path, db_session):
    manifest_path, dataset_dir = _write_dataset(tmp_path, expected_overrides={"recipes": 2})
    old_recipe_id = await _add_old_catalog(db_session)

    with pytest.raises(DatasetValidationError, match="Contagens inesperadas"):
        await seed_static_data(manifest_path, dataset_dir)

    assert await db_session.get(Item, "ZZOLD_ITEM") is not None
    assert await db_session.get(Recipe, old_recipe_id) is not None


async def test_banco_vazio_recebe_dataset_e_versao_ativa(tmp_path, db_session):
    manifest_path, dataset_dir = _write_dataset(tmp_path)

    result = await seed_static_data(manifest_path, dataset_dir)

    assert result.status == "applied"
    assert await db_session.scalar(select(func.count()).select_from(Item)) == 3
    assert await db_session.scalar(select(func.count()).select_from(Recipe)) == 1
    version = await db_session.scalar(
        select(StaticDatasetVersion).where(StaticDatasetVersion.active.is_(True))
    )
    assert version is not None
    assert version.version == "fixture-v1"
    assert version.item_count == 3
    assert version.recipe_count == 1
    ingredients = (
        await db_session.scalars(select(RecipeIngredient).order_by(RecipeIngredient.position))
    ).all()
    assert [(row.ingredient_unique_name, row.position) for row in ingredients] == [
        ("ZZSEED_FIBER", 0),
        ("ZZSEED_CATALYST", 1),
    ]
    locations = {row.location_id: row for row in (await db_session.scalars(select(Location))).all()}
    assert locations["1002"].name == "Lymhurst"
    assert locations["1002"].is_royal_city is True
    assert locations["5003"].name == "Brecilien"
    assert locations["5003"].is_royal_city is False


async def test_nova_revisao_de_transformacao_reaplica_dataset(tmp_path, db_session):
    manifest_path, dataset_dir = _write_dataset(tmp_path)
    db_session.add(
        StaticDatasetVersion(
            dataset_name="test-static-data",
            version="fixture-anterior",
            source_revision="b" * 40,
            manifest_sha256="b" * 64,
            items_sha256="c" * 64,
            item_dump_sha256="d" * 64,
            item_count=1,
            recipe_count=0,
            skipped_recipe_count=0,
            active=True,
        )
    )
    await db_session.commit()

    second = await seed_static_data(manifest_path, dataset_dir)
    third = await seed_static_data(manifest_path, dataset_dir)

    assert second.status == "applied"
    assert third.status == "unchanged"
    assert await db_session.scalar(select(func.count()).select_from(StaticDatasetVersion)) == 2
    ingredients = (
        await db_session.scalars(select(RecipeIngredient).order_by(RecipeIngredient.position))
    ).all()
    assert [row.ingredient_unique_name for row in ingredients] == [
        "ZZSEED_FIBER",
        "ZZSEED_CATALYST",
    ]
    # B11: a coluna derivada production_kind é recalculada na reaplicação (ZZSEED_CLOTH é
    # simpleitem = refino).
    recipe = await db_session.scalar(select(Recipe))
    assert recipe.production_kind == "refining"


async def test_seed_rejeita_revisao_de_transformacao_desconhecida(tmp_path):
    manifest_path, dataset_dir = _write_dataset(tmp_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["transform_revision"] = "transformacao-inexistente"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(DatasetValidationError, match="Revisão de transformação incompatível"):
        await seed_static_data(manifest_path, dataset_dir)


async def test_segunda_execucao_preserva_ids_e_nao_rele_dumps(tmp_path, db_session):
    manifest_path, dataset_dir = _write_dataset(tmp_path)
    await seed_static_data(manifest_path, dataset_dir)
    recipe_id = await db_session.scalar(select(Recipe.id))
    for path in dataset_dir.iterdir():
        path.unlink()

    result = await seed_static_data(manifest_path, dataset_dir)

    assert result.status == "unchanged"
    assert await db_session.scalar(select(Recipe.id)) == recipe_id


async def test_falha_entre_item_e_receita_faz_rollback_integral(tmp_path, db_session, monkeypatch):
    manifest_path, dataset_dir = _write_dataset(tmp_path)
    old_recipe_id = await _add_old_catalog(db_session)

    async def fail_recipe_import(*args, **kwargs):
        raise RuntimeError("falha injetada entre etapas")

    monkeypatch.setattr(seed_module, "apply_recipe_import", fail_recipe_import)
    with pytest.raises(RuntimeError, match="falha injetada"):
        await seed_static_data(manifest_path, dataset_dir)

    db_session.expire_all()
    assert await db_session.get(Item, "ZZOLD_ITEM") is not None
    assert await db_session.get(Recipe, old_recipe_id) is not None
    assert await db_session.scalar(select(func.count()).select_from(StaticDatasetVersion)) == 0


async def test_migration_dataset_faz_round_trip():
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    loop = asyncio.get_running_loop()

    try:
        await loop.run_in_executor(None, command.downgrade, config, "d9a4f5b6c7e8")
        async with async_session_maker() as session:
            exists = await session.scalar(
                text("SELECT to_regclass('public.static_dataset_version') IS NOT NULL")
            )
        assert exists is False

        await loop.run_in_executor(None, command.upgrade, config, "head")
        async with async_session_maker() as session:
            exists = await session.scalar(
                text("SELECT to_regclass('public.static_dataset_version') IS NOT NULL")
            )
        assert exists is True
    finally:
        await loop.run_in_executor(None, command.upgrade, config, "head")
