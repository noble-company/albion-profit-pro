"""Unidades vendidas por dia, para a tela (task 4/23).

Lê o rollup diário (`market_history_daily`), que junta o histórico do nosso client e o da API
pública. A média é sobre **7 dias completos**: o dia de hoje ainda não fechou, e dia sem venda
conta como dia sem venda — 14 unidades em 2 dos 7 dias são 2 por dia, não 7.

Formato colunar, como o snapshot: sem categoria o recorte é o realm inteiro, e array de objetos
repetiria as chaves em cada linha.
"""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.items.models import Item
from src.prices.models import MarketHistoryDaily
from src.prices.snapshot import saidas_da_categoria

JANELA_DE_VENDAS_DIAS = 7


def _texto(valor: Decimal) -> str:
    return "0" if valor == 0 else format(valor.normalize(), "f")


async def read_sales(
    session: AsyncSession,
    server_id: str,
    *,
    kind: str | None = None,
    category: str | None = None,
    subcategory: str | None = None,
    days: int = JANELA_DE_VENDAS_DIAS,
    today: date | None = None,
) -> dict:
    hoje = today or datetime.now(UTC).date()
    inicio = hoje - timedelta(days=days)

    stmt = (
        select(
            Item.unique_name,
            MarketHistoryDaily.location_id,
            MarketHistoryDaily.quality_level,
            func.sum(MarketHistoryDaily.item_amount).label("unidades"),
            func.sum(MarketHistoryDaily.silver_amount).label("prata"),
            func.count().label("dias"),
        )
        # O histórico é chaveado pelo `albion_id`; a tela fala `unique_name`.
        .join(Item, Item.albion_id == MarketHistoryDaily.item_id)
        .where(
            MarketHistoryDaily.server_id == server_id,
            MarketHistoryDaily.dia >= inicio,
            MarketHistoryDaily.dia < hoje,
        )
        .group_by(
            Item.unique_name, MarketHistoryDaily.location_id, MarketHistoryDaily.quality_level
        )
        .order_by(
            Item.unique_name, MarketHistoryDaily.location_id, MarketHistoryDaily.quality_level
        )
    )
    if kind is not None and category is not None:
        stmt = stmt.where(Item.unique_name.in_(saidas_da_categoria(kind, category, subcategory)))

    items: list[str] = []
    locations: list[str] = []
    indice_item: dict[str, int] = {}
    indice_local: dict[str, int] = {}
    columns: dict[str, list] = {
        "item": [],
        "location": [],
        "quality": [],
        "units_per_day": [],
        "average_price": [],
        "days_with_data": [],
    }

    linhas = (await session.execute(stmt)).all()
    for nome, location_id, quality, unidades, prata, dias in linhas:
        if nome not in indice_item:
            indice_item[nome] = len(items)
            items.append(nome)
        if location_id not in indice_local:
            indice_local[location_id] = len(locations)
            locations.append(location_id)

        unidades = Decimal(unidades)
        columns["item"].append(indice_item[nome])
        columns["location"].append(indice_local[location_id])
        columns["quality"].append(quality)
        columns["units_per_day"].append(_texto((unidades / days).quantize(Decimal("0.1"))))
        columns["average_price"].append(
            None
            if unidades == 0
            else _texto((Decimal(prata) / unidades).quantize(Decimal("0.0001")))
        )
        columns["days_with_data"].append(int(dias))

    return {
        "days": days,
        "row_count": len(linhas),
        "items": items,
        "locations": locations,
        "columns": columns,
    }
