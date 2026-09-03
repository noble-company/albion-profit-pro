"""Bootstrap reproduzível do catálogo estático.

Uso em produção, após as migrations::

    uv run python -m scripts.seed_static_data

Por padrão os arquivos são baixados diretamente da revisão imutável declarada no manifesto. Para
ambiente sem egress, monte os três dumps em volume read-only e use ``--dataset-dir /datasets``.
"""

import argparse
import asyncio
import hashlib
import shutil
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from urllib.request import Request, urlopen

import structlog
from pydantic import AnyHttpUrl, BaseModel, Field
from sqlalchemy import func, select, text, update

from scripts.import_items import ItemImportPlan, apply_item_import, prepare_item_import
from scripts.import_locations import (
    LocationImportPlan,
    apply_location_import,
    prepare_location_import,
)
from scripts.import_recipes import RecipeImportPlan, apply_recipe_import, prepare_recipe_import
from src.database import async_session_maker
from src.logging_config import configure_logging
from src.static_data.constants import STATIC_TRANSFORM_REVISION
from src.static_data.models import StaticDatasetVersion

configure_logging()
log = structlog.get_logger()

DEFAULT_MANIFEST = (
    Path(__file__).resolve().parents[1] / "datasets" / "albion-static-2026-08-23.json"
)


class DatasetValidationError(RuntimeError):
    pass


class SourceManifest(BaseModel):
    repository: AnyHttpUrl
    revision: str = Field(min_length=40, max_length=64)


class FileManifest(BaseModel):
    filename: str = Field(min_length=1)
    url: AnyHttpUrl
    size: int = Field(gt=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class FilesManifest(BaseModel):
    items: FileManifest
    item_dump: FileManifest
    world: FileManifest


class LocationsManifest(BaseModel):
    confirmed_market_ids: list[str] = Field(min_length=1)
    royal_city_ids: list[str] = Field(default_factory=list)


class ExpectedCounts(BaseModel):
    source_items: int = Field(ge=0)
    imported_items: int = Field(ge=0)
    skipped_long_item_names: int = Field(ge=0)
    recipes: int = Field(ge=0)
    skipped_multiple_recipes: int = Field(ge=0)
    recipes_without_item_id: int = Field(ge=0)
    curated_locations: int = Field(ge=0)


class DatasetManifest(BaseModel):
    schema_version: int = Field(ge=2, le=2)
    dataset_name: str = Field(min_length=1, max_length=64)
    version: str = Field(min_length=1, max_length=128)
    transform_revision: str = Field(min_length=1, max_length=128)
    source: SourceManifest
    files: FilesManifest
    locations: LocationsManifest
    expected: ExpectedCounts


@dataclass(frozen=True)
class LoadedManifest:
    manifest: DatasetManifest
    sha256: str


@dataclass(frozen=True)
class PreparedDataset:
    items: ItemImportPlan
    recipes: RecipeImportPlan
    locations: LocationImportPlan


@dataclass(frozen=True)
class SeedResult:
    status: str
    manifest_sha256: str
    item_count: int
    recipe_count: int


def load_manifest(path: Path) -> LoadedManifest:
    try:
        content = path.read_bytes()
    except FileNotFoundError as exc:
        raise DatasetValidationError(f"Manifesto ausente: {path}") from exc
    try:
        manifest = DatasetManifest.model_validate_json(content)
    except Exception as exc:
        raise DatasetValidationError(f"Manifesto inválido: {path}: {exc}") from exc
    return LoadedManifest(manifest, hashlib.sha256(content).hexdigest())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_file(path: Path, spec: FileManifest) -> None:
    if not path.is_file():
        raise DatasetValidationError(f"Dataset ausente: {path}")
    size = path.stat().st_size
    if size != spec.size:
        raise DatasetValidationError(
            f"Tamanho inesperado em {spec.filename}: esperado={spec.size}, obtido={size}"
        )
    actual_hash = sha256_file(path)
    if actual_hash != spec.sha256:
        raise DatasetValidationError(
            f"SHA-256 inesperado em {spec.filename}: esperado={spec.sha256}, obtido={actual_hash}"
        )


def download_file(spec: FileManifest, destination: Path) -> None:
    request = Request(str(spec.url), headers={"User-Agent": "Albion-Profit-Pro-Seed/1"})
    try:
        with urlopen(request, timeout=120) as response, destination.open("xb") as target:
            shutil.copyfileobj(response, target, length=1024 * 1024)
    except Exception as exc:
        raise DatasetValidationError(f"Falha ao baixar {spec.filename}: {exc}") from exc


@contextmanager
def materialize_dataset(manifest: DatasetManifest, dataset_dir: Path | None):
    if dataset_dir is not None:
        paths = {
            "items": dataset_dir / manifest.files.items.filename,
            "item_dump": dataset_dir / manifest.files.item_dump.filename,
            "world": dataset_dir / manifest.files.world.filename,
        }
        for key, spec in (
            ("items", manifest.files.items),
            ("item_dump", manifest.files.item_dump),
            ("world", manifest.files.world),
        ):
            validate_file(paths[key], spec)
        yield paths
        return

    with tempfile.TemporaryDirectory(prefix="profitpro-seed-") as temporary:
        directory = Path(temporary)
        paths = {
            "items": directory / manifest.files.items.filename,
            "item_dump": directory / manifest.files.item_dump.filename,
            "world": directory / manifest.files.world.filename,
        }
        for key, spec in (
            ("items", manifest.files.items),
            ("item_dump", manifest.files.item_dump),
            ("world", manifest.files.world),
        ):
            download_file(spec, paths[key])
            validate_file(paths[key], spec)
        yield paths


def prepare_dataset(manifest: DatasetManifest, paths: dict[str, Path]) -> PreparedDataset:
    if manifest.transform_revision != STATIC_TRANSFORM_REVISION:
        raise DatasetValidationError(
            "Revisão de transformação incompatível: "
            f"manifesto={manifest.transform_revision}, código={STATIC_TRANSFORM_REVISION}"
        )
    item_plan = prepare_item_import(paths["items"], paths["item_dump"])
    recipe_plan = prepare_recipe_import(paths["item_dump"], paths["items"])
    location_plan = prepare_location_import(
        paths["world"],
        manifest.locations.confirmed_market_ids,
        manifest.locations.royal_city_ids,
    )
    actual = {
        "source_items": item_plan.source_count,
        "imported_items": len(item_plan.rows),
        "skipped_long_item_names": len(item_plan.skipped_too_long),
        "recipes": len(recipe_plan.recipes),
        "skipped_multiple_recipes": len(recipe_plan.skipped_multi_recipe),
        "recipes_without_item_id": len(recipe_plan.not_found),
        "curated_locations": len(location_plan.rows),
    }
    expected = manifest.expected.model_dump()
    if actual != expected:
        differences = {
            key: {"expected": expected[key], "actual": actual[key]}
            for key in expected
            if expected[key] != actual[key]
        }
        raise DatasetValidationError(f"Contagens inesperadas no dataset: {differences}")
    return PreparedDataset(item_plan, recipe_plan, location_plan)


async def _active_version(dataset_name: str) -> StaticDatasetVersion | None:
    async with async_session_maker() as session:
        return await session.scalar(
            select(StaticDatasetVersion).where(
                StaticDatasetVersion.dataset_name == dataset_name,
                StaticDatasetVersion.active.is_(True),
            )
        )


async def apply_dataset(loaded: LoadedManifest, prepared: PreparedDataset) -> SeedResult:
    manifest = loaded.manifest
    async with async_session_maker() as session, session.begin():
        # Evita dois jobs de seed concorrentes para o mesmo catálogo no Swarm.
        await session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:dataset_name))"),
            {"dataset_name": manifest.dataset_name},
        )
        active = await session.scalar(
            select(StaticDatasetVersion).where(
                StaticDatasetVersion.dataset_name == manifest.dataset_name,
                StaticDatasetVersion.active.is_(True),
            )
        )
        if active is not None and active.manifest_sha256 == loaded.sha256:
            return SeedResult("unchanged", loaded.sha256, active.item_count, active.recipe_count)

        # Uma transação cobre itens, receitas e marcador ativo: leitores veem a versão antiga
        # completa ou a nova completa, nunca as tabelas no meio da substituição.
        await apply_item_import(session, prepared.items, replace=True)
        await apply_recipe_import(session, prepared.recipes)
        await apply_location_import(session, prepared.locations)
        await session.execute(
            update(StaticDatasetVersion)
            .where(
                StaticDatasetVersion.dataset_name == manifest.dataset_name,
                StaticDatasetVersion.active.is_(True),
            )
            .values(active=False)
        )

        version = await session.scalar(
            select(StaticDatasetVersion).where(
                StaticDatasetVersion.dataset_name == manifest.dataset_name,
                StaticDatasetVersion.manifest_sha256 == loaded.sha256,
            )
        )
        values = {
            "version": manifest.version,
            "source_revision": manifest.source.revision,
            "items_sha256": manifest.files.items.sha256,
            "item_dump_sha256": manifest.files.item_dump.sha256,
            "item_count": len(prepared.items.rows),
            "recipe_count": len(prepared.recipes.recipes),
            "skipped_recipe_count": len(prepared.recipes.skipped_multi_recipe),
            "active": True,
            "applied_at": func.now(),
        }
        if version is None:
            session.add(
                StaticDatasetVersion(
                    dataset_name=manifest.dataset_name,
                    manifest_sha256=loaded.sha256,
                    **values,
                )
            )
        else:
            for key, value in values.items():
                setattr(version, key, value)

    return SeedResult(
        "applied", loaded.sha256, len(prepared.items.rows), len(prepared.recipes.recipes)
    )


async def seed_static_data(
    manifest_path: Path = DEFAULT_MANIFEST, dataset_dir: Path | None = None
) -> SeedResult:
    loaded = load_manifest(manifest_path)
    active = await _active_version(loaded.manifest.dataset_name)
    if active is not None and active.manifest_sha256 == loaded.sha256:
        result = SeedResult("unchanged", loaded.sha256, active.item_count, active.recipe_count)
    else:
        with materialize_dataset(loaded.manifest, dataset_dir) as paths:
            prepared = prepare_dataset(loaded.manifest, paths)
            result = await apply_dataset(loaded, prepared)

    log.info(
        "static_seed.concluido",
        status=result.status,
        dataset=loaded.manifest.dataset_name,
        versao=loaded.manifest.version,
        manifest_sha256=result.manifest_sha256,
        itens=result.item_count,
        receitas=result.recipe_count,
    )
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Valida e aplica o dataset estático do Albion")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        help=(
            "Diretório com items.json, ITEM DUMP.json e world.json (volume read-only em produção)"
        ),
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(seed_static_data(args.manifest, args.dataset_dir))
