"""B08: no module imports a ``_private`` symbol from another ``src`` module.

Cross-module private imports are invisible coupling: a refactor inside one module silently
breaks another. Shared internals belong in an explicit public module (e.g. ``src.craft.quotes``).
"""

import ast
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"


def test_no_cross_module_private_imports():
    offenders: list[str] = []
    for path in SRC.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom):
                continue
            if node.level or not node.module or not node.module.startswith("src."):
                continue
            for alias in node.names:
                if alias.name.startswith("_"):
                    rel = path.relative_to(SRC.parent)
                    offenders.append(f"{rel}:{node.lineno} -> {node.module}.{alias.name}")
    assert offenders == [], "cross-module private imports:\n" + "\n".join(offenders)
