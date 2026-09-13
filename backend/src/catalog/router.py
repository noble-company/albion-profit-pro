from typing import Literal

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.catalog.schemas import CatalogRecipesOut
from src.catalog.service import catalog_version, etag_for, get_recipe_catalog
from src.database import get_session

router = APIRouter(prefix="/catalog", tags=["catalog"], dependencies=[Depends(current_active_user)])

# O catálogo só muda quando o dataset estático muda, mas o cliente ainda revalida de tempos em
# tempos para pegar um patch do jogo sem precisar de hard refresh. `private` porque a rota é
# autenticada — nenhum cache compartilhado pode guardar a resposta.
CACHE_CONTROL = "private, max-age=300, must-revalidate"


@router.get("/recipes", response_model=CatalogRecipesOut)
async def read_recipe_catalog(
    response: Response,
    kind: Literal["refining", "crafting"] | None = Query(None),
    if_none_match: str | None = Header(None, alias="If-None-Match"),
    session: AsyncSession = Depends(get_session),
):
    """Catálogo estático inteiro, **sem preço e sem paginação** (task 4/02, achado `X01`).

    Paginar ou filtrar por preço aqui reintroduziria o defeito que a Fase 4 existe para
    resolver: a lista de receitas do produto voltaria a ser um recorte do que já tem preço, em
    vez do catálogo.
    """
    etag = etag_for(await catalog_version(session), kind)

    if if_none_match is not None and etag in {tag.strip() for tag in if_none_match.split(",")}:
        # 304 não carrega corpo, mas precisa repetir os headers de cache — senão o cliente
        # revalida do zero na próxima vez.
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": CACHE_CONTROL})

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = CACHE_CONTROL
    return await get_recipe_catalog(session, kind=kind)
