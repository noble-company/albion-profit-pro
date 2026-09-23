"""Testes da task 3.6/08 (P08) -- o gate de repositório nunca teve teste próprio.

`unittest` puro (stdlib), não pytest: o script que este arquivo testa é deliberadamente livre
de dependências externas (só stdlib + `git`), e um teste de "árvore Git de verdade" não cabe na
suíte do backend (que roda contra Postgres/Redis/RabbitMQ via testcontainers, sem relação com
isto). Rodar com `python scripts/test_verify_repository.py -v` a partir da raiz do repositório.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import verify_repository as vr  # noqa: E402


def _run_git(root: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True)


def _init_repo(root: Path) -> None:
    _run_git(root, "init", "-q", "-b", "main")
    _run_git(root, "config", "user.email", "teste@example.com")
    _run_git(root, "config", "user.name", "Teste")


def _commit_all(root: Path, message: str) -> None:
    _run_git(root, "add", "-A")
    _run_git(root, "commit", "-q", "-m", message)


class VerifyNoUntrackedSourceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        _init_repo(self.root)
        (self.root / "README.md").write_text("# repo de teste\n", encoding="utf-8")
        _commit_all(self.root, "baseline")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_fonte_nao_rastreada_reprova(self) -> None:
        (self.root / "novo.py").write_text("print('oi')\n", encoding="utf-8")
        errors: list[str] = []
        vr.verify_no_untracked_source(errors, root=self.root)
        self.assertTrue(any("fora do Git" in e and "novo.py" in e for e in errors), errors)

    def test_fonte_modificada_sem_commit_reprova(self) -> None:
        (self.root / "README.md").write_text("# mudou\n", encoding="utf-8")
        errors: list[str] = []
        vr.verify_no_untracked_source(errors, root=self.root)
        self.assertTrue(
            any("modificado/staged/deletado" in e and "README.md" in e for e in errors), errors
        )

    def test_fonte_staged_sem_commit_reprova(self) -> None:
        (self.root / "staged.py").write_text("x = 1\n", encoding="utf-8")
        _run_git(self.root, "add", "staged.py")
        errors: list[str] = []
        vr.verify_no_untracked_source(errors, root=self.root)
        self.assertTrue(
            any("modificado/staged/deletado" in e and "staged.py" in e for e in errors), errors
        )

    def test_fonte_deletada_sem_commit_reprova(self) -> None:
        (self.root / "para_apagar.py").write_text("x = 1\n", encoding="utf-8")
        _commit_all(self.root, "adiciona arquivo")
        (self.root / "para_apagar.py").unlink()
        errors: list[str] = []
        vr.verify_no_untracked_source(errors, root=self.root)
        self.assertTrue(
            any("modificado/staged/deletado" in e and "para_apagar.py" in e for e in errors),
            errors,
        )

    def test_fonte_no_gitignore_reprova(self) -> None:
        # A0 original: um diretório de fonte inteiro escondido no .gitignore, não só esquecido.
        (self.root / "src").mkdir()
        (self.root / "src" / "modulo.py").write_text("x = 1\n", encoding="utf-8")
        (self.root / ".gitignore").write_text("src/\n", encoding="utf-8")
        _commit_all(self.root, "adiciona .gitignore")
        errors: list[str] = []
        vr.verify_no_untracked_source(errors, root=self.root)
        self.assertTrue(
            any("ignorado pelo Git" in e and "modulo.py" in e for e in errors), errors
        )

    def test_css_e_yml_nao_rastreados_reprovam(self) -> None:
        (self.root / "tokens.css").write_text(":root { --a: 1; }\n", encoding="utf-8")
        (self.root / "workflow.yml").write_text("on: push\n", encoding="utf-8")
        errors: list[str] = []
        vr.verify_no_untracked_source(errors, root=self.root)
        self.assertTrue(any("tokens.css" in e for e in errors), errors)
        self.assertTrue(any("workflow.yml" in e for e in errors), errors)

    def test_diretorio_ignorado_alistado_nao_reprova(self) -> None:
        # node_modules/.venv/etc são gerados -- nunca é o cenário que este guard persegue.
        (self.root / "node_modules").mkdir()
        (self.root / "node_modules" / "pacote.js").write_text("module.exports = {}\n", "utf-8")
        (self.root / ".gitignore").write_text("node_modules/\n", encoding="utf-8")
        _commit_all(self.root, "adiciona .gitignore")
        errors: list[str] = []
        vr.verify_no_untracked_source(errors, root=self.root)
        self.assertEqual(errors, [])

    def test_diretorio_ignorado_so_com_arquivo_nao_fonte_nao_reprova(self) -> None:
        # Um diretório pode ficar "ignorado" por tabela porque tudo dentro já bate em outro
        # padrão (ex: *.log) -- sem allowlist por nome, sem arquivo de fonte dentro, tem que
        # passar limpo (regressão do bug do primeiro rascunho desta task: reescanear em vez de
        # reprovar o diretório inteiro por suspeita).
        (self.root / "logs").mkdir()
        (self.root / "logs" / "api.out.log").write_text("boot ok\n", encoding="utf-8")
        (self.root / ".gitignore").write_text("*.log\n", encoding="utf-8")
        _commit_all(self.root, "adiciona .gitignore")
        errors: list[str] = []
        vr.verify_no_untracked_source(errors, root=self.root)
        self.assertEqual(errors, [])


class VerifyHeadIsPushedTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.remote = self.root / "remote.git"
        self.local = self.root / "local"
        self.remote.mkdir()
        _run_git(self.remote, "init", "-q", "--bare", "-b", "main")
        self.local.mkdir()
        _init_repo(self.local)
        (self.local / "README.md").write_text("# repo de teste\n", encoding="utf-8")
        _commit_all(self.local, "baseline")
        _run_git(self.local, "remote", "add", "origin", str(self.remote))
        _run_git(self.local, "push", "-q", "-u", "origin", "main")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_commit_nao_publicado_reprova(self) -> None:
        (self.local / "novo.py").write_text("x = 1\n", encoding="utf-8")
        _commit_all(self.local, "commit local, nunca publicado")
        errors: list[str] = []
        vr.verify_head_is_pushed(errors, root=self.local)
        self.assertTrue(any("não publicado" in e for e in errors), errors)

    def test_tudo_publicado_nao_reprova(self) -> None:
        errors: list[str] = []
        vr.verify_head_is_pushed(errors, root=self.local)
        self.assertEqual(errors, [])

    def test_sem_upstream_nao_reprova(self) -> None:
        # HEAD destacado / branch sem tracking (ex: checkout de CI) -- é o estado normal, não
        # é possível confirmar publicação nenhuma, então o check se desliga em silêncio.
        sem_upstream = self.root / "sem-upstream"
        sem_upstream.mkdir()
        _init_repo(sem_upstream)
        (sem_upstream / "README.md").write_text("# sem remoto\n", encoding="utf-8")
        _commit_all(sem_upstream, "baseline")
        errors: list[str] = []
        vr.verify_head_is_pushed(errors, root=sem_upstream)
        self.assertEqual(errors, [])


class ChecklistMarkerTests(unittest.TestCase):
    """P08: hífen no lugar do travessão passa a ser aceito (era o que sumia em silêncio antes
    desta task); o que agora reprova, nomeado, é a linha que não casa NENHUM separador."""

    def _write_readme(self, content: str) -> Path:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        readme = Path(tmp.name) / "README.md"
        readme.parent.mkdir(parents=True, exist_ok=True)
        readme.write_text(content, encoding="utf-8")
        return readme

    def test_linha_com_hifen_e_travessao_nao_reprovam(self) -> None:
        readme = self._write_readme(
            "## Status\n\n- [x] 01 — Primeira tarefa\n- [ ] 02 - Segunda tarefa (hífen)\n"
        )
        errors: list[str] = []
        vr._verify_checklist_markers_parse(errors, label="Teste", readme=readme)
        self.assertEqual(errors, [])

    def test_linha_sem_separador_reconhecivel_reprova(self) -> None:
        # Regressão de P08: antes, uma linha assim simplesmente não entrava em `items` e a task
        # só percebia se por acaso a contagem total desse errado -- agora reprova sempre,
        # nomeada.
        readme = self._write_readme(
            "## Status\n\n- [x] 01 — Primeira tarefa\n- [ ] 02: Segunda tarefa (dois pontos)\n"
        )
        errors: list[str] = []
        vr._verify_checklist_markers_parse(errors, label="Teste", readme=readme)
        self.assertTrue(any("não reconhecida" in e and "02" in e for e in errors), errors)


class MarkdownAnchorsTests(unittest.TestCase):
    """P08: um `#` de comentário dentro de um bloco de código não pode virar âncora válida."""

    def _write_doc(self, content: str) -> Path:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        doc = Path(tmp.name) / "doc.md"
        doc.write_text(content, encoding="utf-8")
        return doc

    def test_comentario_dentro_de_bloco_bash_nao_vira_ancora(self) -> None:
        doc = self._write_doc(
            "# Título real\n\n"
            "```bash\n"
            "# Configuração falsa\n"
            "echo oi\n"
            "```\n"
        )
        anchors = vr.markdown_anchors(doc)
        self.assertIn("título-real", anchors)
        self.assertNotIn("configuração-falsa", anchors)

    def test_titulo_real_apos_bloco_de_codigo_continua_valido(self) -> None:
        doc = self._write_doc(
            "```bash\n# não é título\n```\n\n# Depois do bloco\n"
        )
        anchors = vr.markdown_anchors(doc)
        self.assertIn("depois-do-bloco", anchors)


if __name__ == "__main__":
    unittest.main()
