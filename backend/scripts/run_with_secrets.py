"""Carrega secrets montados em arquivo e executa um processo sem shell intermediário."""

import os
import sys
from pathlib import Path


def load_file_secrets(environ: dict[str, str] | None = None) -> dict[str, str]:
    environ = environ if environ is not None else os.environ
    loaded = {}
    for name, path in list(environ.items()):
        if not name.endswith("_FILE") or not path:
            continue
        target = name.removesuffix("_FILE")
        if target in environ:
            raise RuntimeError(f"configure somente {target} ou {name}, nunca ambos")
        value = Path(path).read_text(encoding="utf-8").strip()
        if not value:
            raise RuntimeError(f"secret vazio: {path}")
        loaded[target] = value
    environ.update(loaded)
    return loaded


def main() -> None:
    command = sys.argv[1:]
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise SystemExit("uso: python -m scripts.run_with_secrets -- <comando> [args...]")
    load_file_secrets()
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
