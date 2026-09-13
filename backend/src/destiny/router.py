from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.auth.models import User
from src.database import get_session
from src.destiny.schemas import DestinyBoardIn, DestinyBoardOut
from src.destiny.service import read_board, replace_board

router = APIRouter(prefix="/me", tags=["destiny"])


@router.get("/destiny-board", response_model=DestinyBoardOut)
async def get_destiny_board(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """O painel do jogador. Vazio significa "não preenchi" — e a tela mostra o custo de foco
    base, que é o de quem nunca especializou nada."""
    return DestinyBoardOut(nodes=await read_board(session, user.id))


@router.put("/destiny-board", response_model=DestinyBoardOut)
async def put_destiny_board(
    payload: DestinyBoardIn,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Substitui o painel inteiro. A tela edita uma grade e salva o conjunto; um `PATCH` por
    nó daria a mesma coisa em N requisições, com estados intermediários que não existem para
    o jogador."""
    return DestinyBoardOut(nodes=await replace_board(session, user.id, payload.nodes))
