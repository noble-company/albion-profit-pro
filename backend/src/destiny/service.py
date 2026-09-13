import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.destiny.models import DestinyNode


async def read_board(session: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    rows = await session.scalars(select(DestinyNode).where(DestinyNode.user_id == user_id))
    return {row.node_key: row.level for row in rows}


async def replace_board(
    session: AsyncSession, user_id: uuid.UUID, nodes: dict[str, int]
) -> dict[str, int]:
    """Troca o painel inteiro. Nó com nível zero **não é gravado**: zero é o padrão de quem
    nunca subiu nada, e guardar linha para ele encheria a tabela com o que não muda conta
    nenhuma."""
    await session.execute(delete(DestinyNode).where(DestinyNode.user_id == user_id))

    guardados = {key: level for key, level in nodes.items() if level > 0}
    session.add_all(
        DestinyNode(user_id=user_id, node_key=key, level=level) for key, level in guardados.items()
    )
    await session.commit()
    return guardados
