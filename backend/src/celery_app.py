from celery import Celery
from celery.schedules import crontab
from kombu import Exchange, Queue

from src.config import get_settings
from src.logging_config import configure_logging

configure_logging()  # worker é um processo separado da API — nunca importa src/main.py

settings = get_settings()

INGEST_QUEUE = "ingest"
MAINTENANCE_QUEUE = "maintenance"
QUARANTINE_QUEUE = "quarantine"


def _durable_queue(name: str) -> Queue:
    exchange = Exchange(name, type="direct", durable=True)
    return Queue(name, exchange=exchange, routing_key=name, durable=True)


celery_app = Celery(
    "albion_profit_pro",
    broker=settings.rabbitmq_url,
    backend=settings.redis_url,  # result backend — usado só se quisermos consultar status de uma task depois; opcional pro nosso caso fire-and-forget
    include=[
        "src.ingest.tasks",  # escrita do caminho quente
        "src.prices.tasks",  # rollups e retenção
        "src.opportunities.tasks",  # ranking de produção materializado
        "src.quarantine.tasks",  # falhas definitivas persistidas
        "src.operations.tasks",  # observabilidade das filas
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_queues=(
        _durable_queue(INGEST_QUEUE),
        _durable_queue(MAINTENANCE_QUEUE),
        _durable_queue(QUARANTINE_QUEUE),
    ),
    task_default_queue=MAINTENANCE_QUEUE,
    task_default_exchange=MAINTENANCE_QUEUE,
    task_default_routing_key=MAINTENANCE_QUEUE,
    task_create_missing_queues=False,
    task_routes={
        "ingest.*": {"queue": INGEST_QUEUE, "routing_key": INGEST_QUEUE},
        "prices.*": {"queue": MAINTENANCE_QUEUE, "routing_key": MAINTENANCE_QUEUE},
        "opportunities.*": {"queue": MAINTENANCE_QUEUE, "routing_key": MAINTENANCE_QUEUE},
        "quarantine.*": {"queue": QUARANTINE_QUEUE, "routing_key": QUARANTINE_QUEUE},
        "operations.*": {"queue": QUARANTINE_QUEUE, "routing_key": QUARANTINE_QUEUE},
    },
    # Não existe consumidor de AsyncResult no produto. O Redis continua configurado como
    # backend para permitir opt-in explícito em uma task futura, mas o caminho normal não
    # cria celery-task-meta-* nem armazena erros (a quarentena no Postgres é autoritativa).
    task_ignore_result=True,
    task_store_errors_even_if_ignored=False,
    result_expires=3600,
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,  # só confirma a task como concluída depois que ela rodar (não ao receber) — evita perder dados se o worker cair no meio
    # Falha normal é ACK depois que on_failure despacha o registro durável da quarentena;
    # reentregar aqui criaria loop de poison message. Perda abrupta usa a opção abaixo.
    task_acks_on_failure_or_timeout=True,
    # Com ACK tardio, Celery ainda confirma por padrão se o processo-filho morre. Esta
    # opção manda reencaminhar a mensagem; todas as tasks afetadas são idempotentes.
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,  # cada worker pega 1 task por vez da fila — evita um worker lento acumular um lote grande enquanto outros ficam ociosos
    # Eventos permitem calcular latência de fila e acompanhar retries/falhas sem persistir
    # resultados. O módulo abaixo também emite os mesmos sinais como logs estruturados.
    worker_send_task_events=True,
    task_send_sent_event=True,
    task_annotations={
        "ingest.process_market_orders": {"soft_time_limit": 120, "time_limit": 150},
        "ingest.process_market_history": {"soft_time_limit": 120, "time_limit": 150},
        "ingest.process_gold_prices": {"soft_time_limit": 120, "time_limit": 150},
        "prices.rollup_diario": {"soft_time_limit": 1800, "time_limit": 1860},
        "prices.rollup_mensal": {"soft_time_limit": 1800, "time_limit": 1860},
        "prices.poda": {"soft_time_limit": 1800, "time_limit": 1860},
        "opportunities.rebuild_recipe_ranking": {"soft_time_limit": 540, "time_limit": 600},
    },
)

# Jobs periódicos rodam no beat, separado dos workers para evitar agendamento duplicado.
# Usa o PersistentScheduler padrão do Celery (sem RedBeat: não há necessidade de
# múltiplas réplicas do beat neste estágio do projeto).
celery_app.conf.beat_schedule = {
    "rollup-diario": {
        "task": "prices.rollup_diario",
        "schedule": crontab(minute=0),  # de hora em hora
        "options": {"queue": MAINTENANCE_QUEUE, "routing_key": MAINTENANCE_QUEUE},
    },
    "poda": {
        "task": "prices.poda",
        # A própria task repete o reparo diário→mensal antes de podar. O offset também evita
        # competir com o rollup horário disparado no minuto zero.
        "schedule": crontab(hour=2, minute=30),  # diário
        "options": {"queue": MAINTENANCE_QUEUE, "routing_key": MAINTENANCE_QUEUE},
    },
    "ranking-de-producao": {
        "task": "opportunities.rebuild_recipe_ranking",
        # A cada 10 min. A janela aceitável de obsolescência é 15 min (payload marca `stale`).
        "schedule": crontab(minute="*/10"),
        "options": {"queue": MAINTENANCE_QUEUE, "routing_key": MAINTENANCE_QUEUE},
    },
    "sync-aodp": {
        "task": "prices.sync_aodp",
        # A cada 10 min. A API pública tem mediana de 7 h de idade, então puxar mais rápido não
        # traria dado mais novo — traria só request gasto. A regra de precedência do snapshot
        # garante que isto nunca sobrescreva o dado fresco do nosso client.
        "schedule": crontab(minute="*/10"),
        "options": {"queue": MAINTENANCE_QUEUE, "routing_key": MAINTENANCE_QUEUE},
    },
    "metricas-das-filas": {
        "task": "operations.log_queue_metrics",
        "schedule": 60.0,
        # O monitor é leve e fica junto da persistência de quarentena para continuar
        # observando ingest/manutenção mesmo quando um job pesado ocupa seu worker.
        "options": {"queue": QUARANTINE_QUEUE, "routing_key": QUARANTINE_QUEUE},
    },
}

# Registra handlers de sinais depois que o app está configurado. Import tardio evita ciclo.
from src import celery_observability as _celery_observability  # noqa: E402, F401
