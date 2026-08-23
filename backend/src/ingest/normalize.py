from datetime import datetime, timezone
from decimal import Decimal

SILVER_SCALE = 10_000  # ver docs/03-contrato-ingest-real.md secao 1 — prata no fio vem sempre x10^4
TICKS_UNIX_EPOCH = (
    621_355_968_000_000_000  # mesma constante do client Go (event_festivities_update.go:13)
)
TICKS_PER_SECOND = 10_000_000  # ticks .NET sao de 100ns

# Timescale=1 e Timescale=2 colapsam de proposito no mesmo bucket_seconds: sao a MESMA serie
# em janelas diferentes, nao granularidades diferentes (medido: 29/29 pontos em comum entre as
# duas idênticos). Ver docs/03-contrato-ingest-real.md, seção 3.
BUCKET_POR_TIMESCALE = {0: 3600, 1: 21600, 2: 21600}


def silver_from_wire(valor: int) -> Decimal:
    """Converte um valor de prata do fio (sempre multiplicado por 10.000) pro valor real."""
    return Decimal(valor) / SILVER_SCALE


def datetime_from_ticks(tick: int) -> datetime:
    """Converte um tick .NET (100ns desde 0001-01-01) pra datetime aware em UTC."""
    unix_seconds = (tick - TICKS_UNIX_EPOCH) / TICKS_PER_SECOND
    try:
        return datetime.fromtimestamp(unix_seconds, tz=timezone.utc)
    except (OverflowError, OSError, ValueError) as exc:
        raise ValueError("timestamp .NET fora do intervalo suportado") from exc


def datetime_from_expires(texto: str) -> datetime:
    """Converte o campo Expires (ISO sem timezone, 0 a 6 casas decimais de fracao de segundo —
    o client corta zeros a direita) pra datetime aware em UTC. Ver
    docs/03-contrato-ingest-real.md secao 5."""
    parsed = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)
