"""Achado real do primeiro deploy em produção (2026-09-23): `DATABASE_URL` com senha
percent-encoded (`%40` para um `@` literal) derrubava `alembic upgrade head` com
"ValueError: invalid interpolation syntax" -- o `configparser` interno do Alembic trata `%`
como início de interpolação. Este teste nasceu vermelho contra `alembic/env.py` sem o
`escape_percent_for_configparser`."""

import sys
from pathlib import Path

from alembic.config import Config

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "alembic"))
from env import escape_percent_for_configparser  # noqa: E402


def test_escape_percent_for_configparser_survives_configparser_roundtrip():
    url = "postgresql+asyncpg://albion_user:alb1i0n_p%40ss!@postgres_postgres:5432/albion_db"

    cfg = Config()
    cfg.set_main_option("sqlalchemy.url", escape_percent_for_configparser(url))

    assert cfg.get_main_option("sqlalchemy.url") == url


def test_url_without_percent_is_unchanged():
    url = "postgresql+asyncpg://user:pass@host:5432/db"
    assert escape_percent_for_configparser(url) == url
