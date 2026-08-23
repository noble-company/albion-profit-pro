from celery import Celery
from celery.schedules import crontab

from src.config import get_settings
from src.logging_config import configure_logging

configure_logging()  # worker é um processo separado da API — nunca importa src/main.py

settings = get_settings()

celery_app = Celery(
    "albion_profit_pro",
    broker=settings.rabbitmq_url,
    backend=settings.redis_url,  # result backend — usado só se quisermos consultar status de uma task depois; opcional pro nosso caso fire-and-forget
    include=[
        "src.ingest.tasks",  # tasks de gravação (task 17)
        "src.prices.tasks",  # rollup diário/mensal e poda (task 31)
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,  # só confirma a task como concluída depois que ela rodar (não ao receber) — evita perder dados se o worker cair no meio
    worker_prefetch_multiplier=1,  # cada worker pega 1 task por vez da fila — evita um worker lento acumular um lote grande enquanto outros ficam ociosos
)

# Job periódico (task 31) — roda via `celery -A src.celery_app beat`, processo separado do
# worker. Usa o PersistentScheduler padrão do Celery (sem RedBeat: não há necessidade de
# múltiplas réplicas do beat neste estágio do projeto).
celery_app.conf.beat_schedule = {
    "rollup-diario": {
        "task": "prices.rollup_diario",
        "schedule": crontab(minute=0),  # de hora em hora
    },
    "rollup-mensal": {
        "task": "prices.rollup_mensal",
        "schedule": crontab(hour=1, minute=0),  # diário
    },
    "poda": {
        "task": "prices.poda",
        "schedule": crontab(hour=2, minute=0),  # diário
    },
}
