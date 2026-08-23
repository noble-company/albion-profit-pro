"""Verifica invariantes documentais e estruturais do monorepo sem dependências externas."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
STABILIZATION_README = ROOT / "docs" / "tasks" / "estabilizacao" / "README.md"
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
    ROOT / ".github" / "workflows" / "backend-ci.yml",
    ROOT / ".github" / "workflows" / "client-ci.yml",
)
MARKDOWN_LINK = re.compile(r"(?<!!)\[[^]]+\]\(([^)]+)\)")
CHECKLIST_ITEM = re.compile(r"^- \[([ xX])] (\d{2}) —", re.MULTILINE)
PHASE_STATUS = re.compile(r"Fase 2\.5[^\n]*?\b(\d{1,2})/14\b", re.IGNORECASE)


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


def verify_phase_status(errors: list[str]) -> None:
    checklist = STABILIZATION_README.read_text(encoding="utf-8")
    items = CHECKLIST_ITEM.findall(checklist)
    numbers = [number for _, number in items]
    if numbers != [f"{number:02d}" for number in range(1, 15)]:
        errors.append("checklist da Fase 2.5 deve conter exatamente as tasks 01 a 14 em ordem")
        return
    completed = sum(marker.casefold() == "x" for marker, _ in items)
    expected = f"{completed}/14"
    for document in STATUS_DOCUMENTS:
        matches = PHASE_STATUS.findall(document.read_text(encoding="utf-8"))
        if not matches:
            errors.append(f"{document.relative_to(ROOT)}: status da Fase 2.5 ausente")
        elif any(f"{value}/14" != expected for value in matches):
            errors.append(
                f"{document.relative_to(ROOT)}: status divergente; esperado {expected}, obtido {matches}"
            )


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
    if errors:
        print("Falhas de integridade do repositório:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Integridade estrutural, status e links locais verificados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
