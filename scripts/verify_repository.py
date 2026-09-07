"""Verifica invariantes documentais e estruturais do monorepo (só stdlib + `git`).

Roda no job `repository` do `backend-ci` e como gate manual da fase: links/âncoras de
Markdown, consistência do status das fases 2.5 e 3.5 entre os documentos de status, arquivos
obrigatórios e ausência de fonte não rastreada (regressão de `A01`).
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
STABILIZATION_README = ROOT / "docs" / "tasks" / "estabilizacao" / "README.md"
REFACTOR_README = ROOT / "docs" / "tasks" / "refatoracao" / "README.md"
STATUS_DOCUMENTS = (
    ROOT / "README.md",
    ROOT / "AGENTS.md",
    ROOT / "CLAUDE.md",
    ROOT / "docs" / "README.md",
    ROOT / "docs" / "00-plano-macro.md",
)
REQUIRED_PATHS = (
    ROOT / "backend" / "README.md",
    ROOT / "albiondata-client" / "README.md",
    ROOT / "frontend" / "e2e" / "README.md",
    ROOT / ".github" / "workflows" / "backend-ci.yml",
    ROOT / ".github" / "workflows" / "client-ci.yml",
    ROOT / ".github" / "workflows" / "frontend-ci.yml",
    ROOT / ".github" / "workflows" / "frontend-e2e.yml",
)
# Extensões de fonte que nunca podem estar fora do Git (regressão de A01/R03).
SOURCE_SUFFIXES = (".py", ".ts", ".tsx", ".go", ".md")
MARKDOWN_LINK = re.compile(r"(?<!!)\[[^]]+\]\(([^)]+)\)")
CHECKLIST_ITEM = re.compile(r"^- \[([ xX])] (\d{2}) —", re.MULTILINE)
PHASE_STATUS = re.compile(r"Fase 2\.5[^\n]*?\b(\d{1,2})/14\b", re.IGNORECASE)
REFACTOR_STATUS = re.compile(r"Fase 3\.5[^\n]*?\b(\d{1,2})/29\b", re.IGNORECASE)


def github_anchor(value: str) -> str:
    without_punctuation = re.sub(r"[^\w\s-]", "", value.casefold())
    return re.sub(r"[-\s]+", "-", without_punctuation).strip("-")


def markdown_anchors(path: Path) -> set[str]:
    anchors: set[str] = set()
    occurrences: dict[str, int] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^#{1,6}\s+(.+?)\s*$", line)
        if not match:
            continue
        base = github_anchor(match.group(1).rstrip("#").strip())
        suffix = occurrences.get(base, 0)
        occurrences[base] = suffix + 1
        anchors.add(base if suffix == 0 else f"{base}-{suffix}")
    return anchors


def verify_markdown_links(errors: list[str]) -> None:
    for document in ROOT.rglob("*.md"):
        if any(part in {".git", ".venv", "vendor", "node_modules"} for part in document.parts):
            continue
        content = document.read_text(encoding="utf-8")
        content = re.sub(r"```.*?```", "", content, flags=re.DOTALL)
        content = re.sub(r"`[^`\n]*`", "", content)
        for raw_target in MARKDOWN_LINK.findall(content):
            target = raw_target.strip().strip("<>")
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            path_part, _, fragment = target.partition("#")
            resolved = (document.parent / unquote(path_part)).resolve()
            try:
                resolved.relative_to(ROOT)
            except ValueError:
                errors.append(f"{document.relative_to(ROOT)}: link escapa do repositório: {target}")
                continue
            if not resolved.exists():
                errors.append(f"{document.relative_to(ROOT)}: destino ausente: {target}")
                continue
            if fragment and resolved.is_file() and resolved.suffix.lower() == ".md":
                if unquote(fragment).casefold() not in markdown_anchors(resolved):
                    errors.append(f"{document.relative_to(ROOT)}: âncora ausente: {target}")


def _verify_checklist_status(
    errors: list[str],
    *,
    label: str,
    readme: Path,
    total: int,
    pattern: re.Pattern[str],
) -> None:
    items = CHECKLIST_ITEM.findall(readme.read_text(encoding="utf-8"))
    numbers = [number for _, number in items]
    if numbers != [f"{number:02d}" for number in range(1, total + 1)]:
        errors.append(f"checklist da {label} deve conter as tasks 01 a {total:02d} em ordem")
        return
    completed = sum(marker.casefold() == "x" for marker, _ in items)
    expected = f"{completed}/{total}"
    for document in STATUS_DOCUMENTS:
        matches = pattern.findall(document.read_text(encoding="utf-8"))
        if not matches:
            errors.append(f"{document.relative_to(ROOT)}: status da {label} ausente")
        elif any(f"{value}/{total}" != expected for value in matches):
            errors.append(
                f"{document.relative_to(ROOT)}: status da {label} divergente; "
                f"esperado {expected}, obtido {matches}"
            )


def verify_phase_status(errors: list[str]) -> None:
    _verify_checklist_status(
        errors, label="Fase 2.5", readme=STABILIZATION_README, total=14, pattern=PHASE_STATUS
    )
    _verify_checklist_status(
        errors, label="Fase 3.5", readme=REFACTOR_README, total=29, pattern=REFACTOR_STATUS
    )


def verify_no_untracked_source(errors: list[str]) -> None:
    """Regressão de A01/R03: nenhum arquivo de fonte pode estar fora do Git."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=all"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        errors.append("não foi possível rodar `git status` para checar fonte não rastreada")
        return
    for line in result.stdout.splitlines():
        if not line.startswith("??"):
            continue
        path = line[3:].strip().strip('"')
        if Path(path).suffix.lower() in SOURCE_SUFFIXES:
            errors.append(f"arquivo de fonte fora do Git: {path}")


def verify_structure(errors: list[str]) -> None:
    for path in REQUIRED_PATHS:
        if not path.is_file():
            errors.append(f"arquivo obrigatório ausente: {path.relative_to(ROOT)}")
    nested_git = ROOT / "albiondata-client" / ".git"
    if nested_git.exists():
        errors.append("albiondata-client não pode possuir .git próprio")


def main() -> int:
    errors: list[str] = []
    verify_structure(errors)
    verify_phase_status(errors)
    verify_markdown_links(errors)
    verify_no_untracked_source(errors)
    if errors:
        print("Falhas de integridade do repositório:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Integridade estrutural, status e links locais verificados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
