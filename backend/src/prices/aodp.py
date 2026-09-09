"""Cliente da API pública do Albion Data Project (task 4/04, achado `X06`).

Sem Celery e sem banco de propósito: tudo aqui é função pura ou I/O explícito, para poder ser
testado com `httpx.MockTransport` sem subir infraestrutura.

**O que esta fonte resolve e o que não resolve.** Ela dá *largura* — preço de item que ninguém
abriu no jogo. Ela **não** dá frescor: medido na análise da fase, a mediana de idade é de 7 h e
só 38% das linhas estão abaixo de 6 h. É por isso que a regra de precedência de
`snapshot.upsert_snapshot` existe: sem ela este poller apagaria, a cada 10 minutos, o preço de
minutos atrás que o nosso client acabou de trazer.
"""

from datetime import UTC, datetime
from decimal import Decimal
from urllib.parse import quote

import httpx
import structlog

from src.prices.snapshot import SOURCE_AODP

log = structlog.get_logger()

# Medido: 180 req/min, 300 req/5min, URL <= 4096 chars.
URL_MAX_CHARS = 4096
DEFAULT_BASE_URL_TEMPLATE = "https://{realm}.albion-online-data.com"
PRICES_PATH = "/api/v2/stats/prices/"

# A API identifica mercado por nome; nós, por `location_id`. O mapa é explícito, não uma busca
# por nome na tabela `location`, por um motivo concreto: **Lymhurst tem dois ids** lá (`1002` e
# `1301`, ver a migração `f2d7e8f9a0b1`). Escolher o errado faria as duas fontes gravarem linhas
# diferentes para a mesma cidade, que nunca se encontrariam.
#
# Medido no dado real: o client reporta `1002` (4.363 ordens observadas); `1301` não aparece
# nenhuma vez. Por isso o mapa aponta para `1002`.
CITY_TO_LOCATION_ID: dict[str, str] = {
    "Lymhurst": "1002",
    "Bridgewatch": "2004",
    "Caerleon": "3005",
    "Martlock": "3008",
    "Fort Sterling": "4002",
    "Thetford": "0007",
    "Brecilien": "5003",
    "Black Market": "3003",
}

DEFAULT_CITIES = tuple(CITY_TO_LOCATION_ID)


def base_url_for(realm: str, template: str = DEFAULT_BASE_URL_TEMPLATE) -> str:
    return template.format(realm=realm)


def build_batches(
    item_ids: list[str], cities: tuple[str, ...] = DEFAULT_CITIES, base_url: str = ""
) -> list[list[str]]:
    """Divide os itens em lotes cuja URL final cabe no teto de 4.096 chars.

    O orçamento desconta o host, o caminho, a query de cidades e uma folga — estourar o limite
    não devolve erro claro, devolve resposta truncada ou 414, e a gente descobriria em produção.
    """
    suffix = f".json?locations={quote(','.join(cities))}&qualities=1"
    fixed = len(base_url) + len(PRICES_PATH) + len(suffix)
    budget = URL_MAX_CHARS - fixed - 64  # folga para encoding e redirect

    batches: list[list[str]] = []
    current: list[str] = []
    current_len = 0
    for item_id in item_ids:
        encoded = len(quote(item_id)) + 1  # +1 pela vírgula
        if current and current_len + encoded > budget:
            batches.append(current)
            current, current_len = [], 0
        current.append(item_id)
        current_len += encoded
    if current:
        batches.append(current)
    return batches


def _price(value) -> Decimal | None:
    """A API usa `0` para "não tenho preço". Gravar zero violaria o check de positividade do
    snapshot e, pior, diria que o item vale nada — que é uma afirmação, não uma ausência."""
    if value is None:
        return None
    parsed = Decimal(str(value))
    return None if parsed <= 0 else parsed


def _observed_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    # A API devolve timestamps sem timezone, em UTC.
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def to_snapshot_rows(raw: list[dict]) -> list[dict]:
    """Converte a resposta da API para o formato de `snapshot.upsert_snapshot`.

    Os dois lados carregam timestamps **independentes** (`sell_price_min_date` e
    `buy_price_max_date`) porque a própria API os observa em momentos diferentes.
    """
    rows: list[dict] = []
    ignored_cities: set[str] = set()

    for entry in raw:
        location_id = CITY_TO_LOCATION_ID.get(entry.get("city", ""))
        if location_id is None:
            ignored_cities.add(entry.get("city", ""))
            continue

        sell = _price(entry.get("sell_price_min"))
        buy = _price(entry.get("buy_price_max"))
        if sell is None and buy is None:
            continue  # linha sem nenhum preço não acrescenta nada ao snapshot

        sell_at = _observed_at(entry.get("sell_price_min_date")) if sell is not None else None
        buy_at = _observed_at(entry.get("buy_price_max_date")) if buy is not None else None

        rows.append(
            {
                "item_id": entry["item_id"],
                "location_id": location_id,
                "quality_level": int(entry.get("quality") or 1),
                # A API não expõe encantamento como campo: ele já vem no sufixo `@N` do item_id,
                # mesma convenção do nosso catálogo.
                "enchantment_level": _enchantment_from_item_id(entry["item_id"]),
                "sell_min": sell,
                "sell_observed_at": sell_at,
                "sell_source": SOURCE_AODP if sell is not None and sell_at else None,
                "buy_max": buy,
                "buy_observed_at": buy_at,
                "buy_source": SOURCE_AODP if buy is not None and buy_at else None,
            }
        )

    if ignored_cities:
        # Mercado que não está no mapa é ignorado com registro — nunca vira `location_id`
        # inventado, que poluiria o snapshot com uma cidade que o produto não conhece.
        log.info("aodp.cidades_ignoradas", cidades=sorted(ignored_cities))

    return [row for row in rows if row["sell_source"] or row["buy_source"]]


def _enchantment_from_item_id(item_id: str) -> int:
    if "@" not in item_id:
        return 0
    try:
        return int(item_id.rsplit("@", 1)[1])
    except ValueError:
        return 0


async def fetch_prices(
    client: httpx.AsyncClient,
    base_url: str,
    items: list[str],
    cities: tuple[str, ...] = DEFAULT_CITIES,
) -> list[dict]:
    """Um lote. Levanta `httpx.HTTPError` — quem chama decide se isola a falha."""
    url = f"{base_url}{PRICES_PATH}{','.join(items)}.json"
    response = await client.get(
        url, params={"locations": ",".join(cities), "qualities": "1"}, timeout=30.0
    )
    response.raise_for_status()
    return response.json()
