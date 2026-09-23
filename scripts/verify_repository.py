"""Verifica invariantes documentais e estruturais do monorepo (só stdlib + `git`).

Roda no job `repository` do `backend-ci` e como gate manual da fase: links/âncoras de
Markdown, consistência do status das fases 2.5, 3.5, 4, 3 e 3.6 entre os documentos de status,
arquivos obrigatórios e ausência de fonte fora do controle de versão (regressão de `A01`,
estendida pela task 3.6/08 -- `P08`).

**A checagem de `git` é local por natureza** (task 3.6/08, item 8). `actions/checkout` sempre
produz árvore limpa e HEAD destacado (sem upstream), então em CI `verify_no_untracked_source`
nunca encontra nada pra reportar e `verify_head_is_pushed` se auto-desliga (sem upstream
resolvível, não é erro -- é o estado normal de um checkout de CI). As duas só têm valor real
rodando localmente, antes de fechar uma fase. Pra ganhar valor em CI seria preciso
`fetch-depth: 0` e comparar contra o remoto de verdade, o que este script não faz de propósito
(evita depender de rede).
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
STABILIZATION_README = ROOT / "docs" / "tasks" / "estabilizacao" / "README.md"
REFACTOR_README = ROOT / "docs" / "tasks" / "refatoracao" / "README.md"
SCANNER_README = ROOT / "docs" / "tasks" / "scanner" / "README.md"
FRONTEND_README = ROOT / "docs" / "tasks" / "frontend" / "README.md"
CORRECOES_README = ROOT / "docs" / "tasks" / "correcoes" / "README.md"
STATUS_DOCUMENTS = (
    ROOT / "README.md",
    ROOT / "AGENTS.md",
    ROOT / "CLAUDE.md",
    ROOT / "docs" / "README.md",
    ROOT / "docs" / "00-plano-macro.md",
)
# Fase 3 declara "N/19" só nestes dois -- CLAUDE.md/AGENTS.md/README.md descrevem a fase por
# tabela de diretório, sem fração. Forçar a frase nos outros três seria escrever documento novo,
# não verificar o que já existe.
FRONTEND_STATUS_DOCUMENTS = (
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
# Extensões de fonte que nunca podem estar fora do controle de versão (regressão de A01/R03;
# .css/.yml/.yaml/.mjs/.cjs/.sql/.sh/.toml acrescentados na task 3.6/08 -- P08).
SOURCE_SUFFIXES = (
    ".py",
    ".ts",
    ".tsx",
    ".go",
    ".md",
    ".css",
    ".yml",
    ".yaml",
    ".mjs",
    ".cjs",
    ".sql",
    ".sh",
    ".toml",
)
# Diretórios ignorados pelo Git que são gerados/cache, nunca fonte -- task 3.6/08 (P08): um
# diretório de fonte de verdade que caísse no .gitignore por engano tem que continuar aparecendo
# aqui como erro, não desaparecer junto com node_modules/.venv.
IGNORED_DIR_ALLOWLIST = {
    "node_modules",
    "dist",
    "dist-ssr",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".mypy_cache",
    "htmlcov",
    "runtime-logs",
    "coverage",
    "playwright-report",
    "test-results",
    ".cache",
    ".gocache",
    "bin",
    ".idea",
    ".vscode",
    ".git",
}
IGNORED_DIR_PREFIX_ALLOWLIST = (".uv-cache",)
# Arquivo individual, ignorado por nome e por motivo documentado -- não é o "diretório de fonte
# inteiro escondido" que o A01 descreve. `config.yaml` é o segredo local do client (ApiToken),
# mesmo papel que `.env` tem no backend (seção "Env/secrets" do próprio .gitignore da raiz).
IGNORED_FILE_ALLOWLIST = {
    "albiondata-client/config.yaml",
}
MARKDOWN_LINK = re.compile(r"(?<!!)\[[^]]+\]\(([^)]+)\)")
# Aceita hífen, en-dash e em-dash como separador (task 3.6/08 -- P08 já achava linhas com hífen
# invisíveis pro guard); CHECKLIST_MARKER (abaixo) detecta a linha que NENHUM dos três casa.
# O prefixo de letra opcional (`[A-Za-z]?`) reconhece as extensões pós-fase (`A01`-`A08` no
# scanner) como linha válida, sem contá-las no total de nenhuma fase -- SCANNER_ITEM, abaixo,
# fica só com os dígitos puros pra isso.
CHECKLIST_ITEM = re.compile(r"^- \[([ xX])] ([A-Za-z]?\d{2}(?:\.\d+)*) [-–—]", re.MULTILINE)
CHECKLIST_MARKER = re.compile(r"^- \[[ xX]]", re.MULTILINE)
PHASE_STATUS = re.compile(r"Fase 2\.5[^\n]*?\b(\d{1,2})/14\b", re.IGNORECASE)
REFACTOR_STATUS = re.compile(r"Fase 3\.5[^\n]*?\b(\d{1,2})/29\b", re.IGNORECASE)
FRONTEND_STATUS = re.compile(r"Fase 3\b(?!\.\d)[^\n]*?\b(\d{1,2})/19\b", re.IGNORECASE)
# A Fase 4 numera tasks com subníveis (`11.2.3`) e fecha fora de ordem (15 e 16 no fim): a
# contagem sai do checklist, não de uma sequência 01..N. Só dígitos -- as extensões `A01`-`A08`
# (pós-fase, não contam no total de 38) casam CHECKLIST_ITEM mas não este.
SCANNER_ITEM = re.compile(r"^- \[([ xX])] (\d{2}(?:\.\d+)*) [-–—]", re.MULTILINE)


def _display_path(path: Path, root: Path = ROOT) -> str:
    """Caminho relativo à raiz quando dá -- em teste, `readme`/`root` apontam pra um
    repositório temporário fora de `ROOT`, e `Path.relative_to` levantaria em vez de só mostrar
    o caminho absoluto."""
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def github_anchor(value: str) -> str:
    without_punctuation = re.sub(r"[^\w\s-]", "", value.casefold())
    return re.sub(r"[-\s]+", "-", without_punctuation).strip("-")


def markdown_anchors(path: Path) -> set[str]:
    anchors: set[str] = set()
    occurrences: dict[str, int] = {}
    content = path.read_text(encoding="utf-8")
    # Task 3.6/08 (P08): sem isto, um `# comentário` dentro de um bloco ```bash vira âncora
    # válida por engano -- exatamente o mesmo strip que verify_markdown_links já faz na origem.
    content = re.sub(r"```.*?```", "", content, flags=re.DOTALL)
    for line in content.splitlines():
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


def _checklist_section(readme: Path, section: tuple[str, str] | None) -> str:
    """Recorta só o bloco do checklist principal quando o documento também tem uma extensão
    numerada à parte (task 3.6/08 -- a extensão 20.x do frontend usa `\\d{2}.N`, dígitos puros
    como o checklist principal, então só dá pra separar os dois por posição no texto, não por
    padrão)."""
    content = readme.read_text(encoding="utf-8")
    if section is None:
        return content
    start_marker, end_marker = section
    start = content.index(start_marker)
    end = content.index(end_marker, start)
    return content[start:end]


def _verify_checklist_markers_parse(
    errors: list[str],
    *,
    label: str,
    readme: Path,
    section: tuple[str, str] | None = None,
) -> None:
    """Task 3.6/08 (P08): toda linha `- [ ]`/`- [x]` tem que casar CHECKLIST_ITEM por completo.
    Antes, uma linha com hífen no lugar do travessão (ou qualquer outra forma malformada) não
    aparecia em `items` e era ignorada em silêncio -- o total só reprovava se por acaso a
    contagem também desse errado. Agora ela reprova sempre, nomeada."""
    content = _checklist_section(readme, section)
    marker_starts = {m.start() for m in CHECKLIST_MARKER.finditer(content)}
    item_starts = {m.start() for m in CHECKLIST_ITEM.finditer(content)}
    for start in sorted(marker_starts - item_starts):
        end = content.find("\n", start)
        line = content[start : end if end != -1 else None]
        errors.append(
            f"{_display_path(readme)}: linha de checklist da {label} não reconhecida: {line!r}"
        )


def _verify_checklist_status(
    errors: list[str],
    *,
    label: str,
    readme: Path,
    total: int,
    pattern: re.Pattern[str],
    documents: tuple[Path, ...] = STATUS_DOCUMENTS,
    section: tuple[str, str] | None = None,
) -> None:
    _verify_checklist_markers_parse(errors, label=label, readme=readme, section=section)
    items = CHECKLIST_ITEM.findall(_checklist_section(readme, section))
    numbers = [number for _, number in items]
    if numbers != [f"{number:02d}" for number in range(1, total + 1)]:
        errors.append(f"checklist da {label} deve conter as tasks 01 a {total:02d} em ordem")
        return
    completed = sum(marker.casefold() == "x" for marker, _ in items)
    _verify_status_documents(
        errors, label=label, completed=completed, total=total, pattern=pattern, documents=documents
    )


def _verify_status_documents(
    errors: list[str],
    *,
    label: str,
    completed: int,
    total: int,
    pattern: re.Pattern[str],
    documents: tuple[Path, ...] = STATUS_DOCUMENTS,
) -> None:
    expected = f"{completed}/{total}"
    for document in documents:
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
    verify_scanner_status(errors)
    verify_frontend_status(errors)
    verify_correcoes_status(errors)


def verify_scanner_status(errors: list[str]) -> None:
    """Fase 4 (task 4/16). Sem esta checagem a fase inteira aconteceu com `CLAUDE.md`, `README.md`
    e o plano macro dizendo "Fase 3.6, 0/17" — o gate só conferia as fases 2.5 e 3.5."""
    _verify_checklist_markers_parse(errors, label="Fase 4", readme=SCANNER_README)
    items = SCANNER_ITEM.findall(SCANNER_README.read_text(encoding="utf-8"))
    numbers = [number for _, number in items]
    if not items:
        errors.append("checklist da Fase 4 ausente em docs/tasks/scanner/README.md")
        return
    if len(set(numbers)) != len(numbers):
        errors.append("checklist da Fase 4 repete task")
        return
    total = len(items)
    completed = sum(marker.casefold() == "x" for marker, _ in items)
    pattern = re.compile(rf"Fase 4\b[^\n]*?\b(\d{{1,2}})/{total}\b", re.IGNORECASE)
    _verify_status_documents(
        errors, label="Fase 4", completed=completed, total=total, pattern=pattern
    )


def verify_frontend_status(errors: list[str]) -> None:
    """Fase 3 (task 3.6/08, P08). O checklist principal é 01-19; a extensão 20.x (`\\d{2}.N`,
    dígitos puros como o principal) é recortada fora por posição no texto -- ela não conta pro
    "N/19" nem é uma fase própria com fração esperada. A fração "N/19" só existe em
    `docs/README.md` e `docs/00-plano-macro.md` hoje; exigi-la também em
    CLAUDE.md/AGENTS.md/README.md seria inventar conteúdo novo nesses documentos, não verificar
    o que já está escrito."""
    _verify_checklist_status(
        errors,
        label="Fase 3",
        readme=FRONTEND_README,
        total=19,
        pattern=FRONTEND_STATUS,
        documents=FRONTEND_STATUS_DOCUMENTS,
        section=("## Status — Fase 3", "### Extensão transversal"),
    )


def verify_correcoes_status(errors: list[str]) -> None:
    """Fase 3.6 (task 3.6/08, P08). Superada pela Fase 4 -- várias tasks do checklist (02-04,
    07, 11, 12, 16) não precisam mais ser feitas, então a contagem de `[x]` não é "progresso da
    fase" do jeito que é nas outras. Nenhum documento afirma uma fração "N/17" hoje, e inventar
    uma só para o gate checar seria documentar um número que ninguém decidiu. Só a integridade
    do checklist é verificada: sequência 01-17 sem furo, sem linha malformada."""
    _verify_checklist_markers_parse(errors, label="Fase 3.6", readme=CORRECOES_README)
    items = CHECKLIST_ITEM.findall(CORRECOES_README.read_text(encoding="utf-8"))
    numbers = [number for _, number in items]
    total = 17
    if numbers != [f"{number:02d}" for number in range(1, total + 1)]:
        errors.append(f"checklist da Fase 3.6 deve conter as tasks 01 a {total:02d} em ordem")


def _is_allowlisted_ignored_dir(path: str) -> bool:
    name = PurePosixPath(path.rstrip("/")).name
    if name in IGNORED_DIR_ALLOWLIST:
        return True
    return any(name.startswith(prefix) for prefix in IGNORED_DIR_PREFIX_ALLOWLIST)


def _current_path(porcelain_path: str) -> str:
    # Linhas de rename/copy vêm como "old -> new"; o que importa pra checagem de fonte é onde
    # o arquivo está agora.
    if " -> " in porcelain_path:
        return porcelain_path.split(" -> ", 1)[1]
    return porcelain_path


def _git_status(root: Path, *args: str) -> list[str] | None:
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain", *args],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return result.stdout.splitlines()


def verify_no_untracked_source(errors: list[str], root: Path = ROOT) -> None:
    """Regressão de A01/R03, estendida pela task 3.6/08 (P08): nenhum arquivo de fonte pode
    estar fora do controle de versão de verdade -- não rastreado, modificado/staged/deletado
    sem commit, ou escondido atrás de uma entrada nova no `.gitignore` (a variante exata que o
    `A01` original descreve: um diretório de fonte inteiro ignorado, não só esquecido).

    Duas chamadas separadas de propósito: `--untracked-files=all` é o que dá visibilidade
    arquivo-a-arquivo do que está fora do Git, mas combinado com `--ignored` o Git para de
    colapsar diretório ignorado (`backend/.venv/` vira uma linha) e expande cada arquivo dentro
    dele -- dezenas de milhares de linhas por rodada, e a allowlist de diretório nunca teria
    chance de casar contra um arquivo individual."""
    tracked_changes = _git_status(root, "--untracked-files=all")
    ignored = _git_status(root, "--ignored")
    if tracked_changes is None or ignored is None:
        errors.append("não foi possível rodar `git status` para checar fonte fora do Git")
        return

    for line in tracked_changes:
        if len(line) < 4:
            continue
        status, raw_path = line[:2], line[3:].strip().strip('"')
        if status == "!!":
            continue
        path = _current_path(raw_path)
        if Path(path).suffix.lower() not in SOURCE_SUFFIXES:
            continue
        if status == "??":
            errors.append(f"arquivo de fonte fora do Git: {path}")
        else:
            errors.append(
                f"arquivo de fonte modificado/staged/deletado sem commit: {path} ({status.strip()})"
            )

    for line in ignored:
        if not line.startswith("!!"):
            continue
        path = _current_path(line[3:].strip().strip('"'))
        if path.endswith("/"):
            if _is_allowlisted_ignored_dir(path):
                continue
            # Um diretório pode aparecer aqui só porque tudo dentro dele já é ignorado por
            # outro motivo (ex: uma pasta de log cujos arquivos batem em `*.log`) -- não é o
            # cenário do A01 até ter fonte de verdade dentro. Reescanear só este diretório
            # (nunca o repositório inteiro) é barato porque só diretórios desconhecidos chegam
            # aqui; `.venv`/`node_modules`/etc já saíram acima.
            nested = _git_status(root, "--ignored", "--untracked-files=all", "--", path)
            if nested is None:
                errors.append(f"diretório ignorado pelo Git fora da allowlist: {path}")
                continue
            for nested_line in nested:
                nested_path = _current_path(nested_line[3:].strip().strip('"'))
                if Path(nested_path).suffix.lower() in SOURCE_SUFFIXES:
                    errors.append(f"arquivo de fonte ignorado pelo Git: {nested_path}")
            continue
        if path in IGNORED_FILE_ALLOWLIST:
            continue
        if Path(path).suffix.lower() in SOURCE_SUFFIXES:
            errors.append(f"arquivo de fonte ignorado pelo Git: {path}")


def verify_head_is_pushed(errors: list[str], root: Path = ROOT) -> None:
    """Task 3.6/08 (P08): `README.md` promete "todo o trabalho precisa estar publicado", mas
    nada verificava. Local por natureza (ver docstring do módulo) -- sem upstream resolvível
    (checkout de CI em HEAD destacado, ou repositório local sem `git push -u` ainda feito) não é
    erro, é só a ausência da informação que este check precisa; ele se desliga em silêncio."""
    upstream = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        cwd=root,
        capture_output=True,
        text=True,
    )
    if upstream.returncode != 0:
        return
    branch = upstream.stdout.strip()
    try:
        ahead = subprocess.run(
            ["git", "rev-list", "--count", f"{branch}..HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        errors.append("não foi possível rodar `git rev-list` para checar commits não publicados")
        return
    count = int(ahead.stdout.strip() or "0")
    if count > 0:
        commit = "commit" if count == 1 else "commits"
        errors.append(f"{count} {commit} local(is) não publicado(s) em {branch}")


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
    verify_head_is_pushed(errors)
    if errors:
        print("Falhas de integridade do repositório:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Integridade estrutural, status e links locais verificados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
