"""Operação canônica: `uv run python -m scripts.quarantine <list|reprocess>`.

O acesso ao shell/secret do ambiente é a fronteira de autorização operacional. Todo
reprocessamento também exige ator e confirmação literal do UUID e fica auditado no banco.
"""

import argparse
import asyncio
import json
import uuid

from src.celery_app import celery_app
from src.database import async_session_maker
from src.quarantine.service import list_quarantined_tasks, requeue_failure


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Listar e reprocessar falhas do Celery")
    subcommands = parser.add_subparsers(dest="command", required=True)

    list_parser = subcommands.add_parser("list", help="listar falhas em quarentena")
    list_parser.add_argument("--status", default="pending", help="status ou 'all'")
    list_parser.add_argument("--limit", type=int, default=100)

    replay_parser = subcommands.add_parser("reprocess", help="republicar uma falha pendente")
    replay_parser.add_argument("failure_id", type=uuid.UUID)
    replay_parser.add_argument("--actor", required=True, help="identidade auditável do operador")
    replay_parser.add_argument(
        "--confirm",
        required=True,
        help="repita literalmente o UUID da falha para autorizar",
    )
    return parser


async def _list(status: str, limit: int) -> None:
    if limit < 1 or limit > 1000:
        raise ValueError("--limit deve estar entre 1 e 1000")
    async with async_session_maker() as session:
        rows = await list_quarantined_tasks(
            session,
            status=None if status == "all" else status,
            limit=limit,
        )
    for row in rows:
        print(
            json.dumps(
                {
                    "id": str(row.id),
                    "celery_task_id": row.celery_task_id,
                    "task_name": row.task_name,
                    "kind": row.failure_kind,
                    "topic": row.topic,
                    "realm": row.realm,
                    "attempts": row.attempts,
                    "error_type": row.error_type,
                    "error_summary": row.error_summary,
                    "payload_sha256": row.payload_sha256,
                    "status": row.status,
                    "failed_at": row.failed_at.isoformat(),
                },
                ensure_ascii=False,
            )
        )


async def _reprocess(failure_id: uuid.UUID, actor: str, confirmation: str) -> None:
    if confirmation != str(failure_id):
        raise PermissionError("--confirm deve ser igual ao UUID da falha")
    if not actor.strip():
        raise ValueError("--actor não pode ser vazio")
    async with async_session_maker() as session:
        dispatched_task_id = await requeue_failure(
            session,
            celery_app,
            failure_id,
            actor.strip(),
        )
    print(
        json.dumps(
            {
                "failure_id": str(failure_id),
                "dispatched_task_id": dispatched_task_id,
                "status": "dispatched",
            }
        )
    )


async def _main() -> None:
    args = _parser().parse_args()
    if args.command == "list":
        await _list(args.status, args.limit)
    else:
        await _reprocess(args.failure_id, args.actor, args.confirm)


if __name__ == "__main__":
    asyncio.run(_main())
