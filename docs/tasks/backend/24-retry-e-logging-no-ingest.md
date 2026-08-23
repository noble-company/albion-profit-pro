# 24 — Retry, logging estruturado e gold price explícito

> Corrige **A5**, **P3** e **C6** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).

## Objetivo
Fazer o pipeline de ingest parar de perder dado em silêncio: retry automático em falha
transitória, log estruturado de verdade nas tasks e routers, e um destino explícito pro
`goldprices.ingest` em vez de descarte mudo.

## Por que
Hoje uma exceção dentro de uma task Celery **apaga o lote sem deixar rastro**. `task_acks_late`
só protege contra o worker morrer — uma exceção normal ainda dá ack e a mensagem some. Um blip
do Postgres durante um pico de coleta = dados perdidos, sem log, sem alerta.

E a task 22 entregou a *configuração* do structlog, mas nenhuma chamada: não existe uma linha
`log.` em `src/`. Pior, o `structlog.configure()` está em `src/main.py`, que o **worker nunca
importa** — mesmo que houvesse logs no worker, sairiam sem estrutura.

`process_gold_prices` tem corpo vazio (`...`) e o router responde 200: o client acredita que
subiu. Decisão do usuário (2026-08-22) é manter gold price fora de escopo — mas descartar
calado é diferente de descartar de propósito.

## O que implementar

### 1. `src/logging_config.py` (novo)
Mover o `structlog.configure()` de `src/main.py` pra um módulo próprio, importado **tanto por
`src/main.py` quanto por `src/celery_app.py`** — é isso que faz o worker logar em JSON.

### 2. Retry nas três tasks
```python
@celery_app.task(
    name="ingest.process_market_orders",
    bind=True,
    autoretry_for=(OperationalError, InterfaceError, RedisConnectionError),
    retry_backoff=True,       # 1s, 2s, 4s...
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def process_market_orders(self, payload: dict, user_id: str) -> None:
    ...
```
Erros de **programação** (`KeyError`, `ValidationError`) não devem entrar no `autoretry_for` —
retentar não conserta, só multiplica o log. Esses devem ser logados e descartados
explicitamente.

### 3. Logs com contexto nos pontos que importam
Mínimo: início/fim de cada task com `topico`, `user_id`, `n_itens`, `duracao_ms`; falha com
`exc_info`; e no router, rejeição de payload. Usar campos estruturados
(`log.info("ingest.gravado", topico=..., linhas=...)`), nunca f-string.

### 4. Gold price explícito
Manter o endpoint aceitando 200 (o client não deve receber erro por algo que é decisão nossa),
mas a task loga `log.warning("ingest.descartado", topico="goldprices", motivo="fora de escopo",
n_pontos=len(...))` e não faz mais nada. Deixar registrado no docstring que a implementação
completa depende de criar o modelo `GoldPrice`.

## Bibliotecas/dependências
Nenhuma nova (`structlog` já está no `pyproject.toml`).

## Depende de
Task 23 (o ciclo de vida do engine muda a assinatura das tasks).

## Testes manuais
1. Subir worker, derrubar o Postgres (`docker compose stop postgres`), enviar um POST de
   ingest → o log deve mostrar as tentativas de retry com backoff, não uma exceção seca.
2. Subir o Postgres de volta antes do `max_retries` estourar → a task deve concluir e gravar.
3. `POST /goldprices.ingest` → 200, e um `WARNING` estruturado no log do worker dizendo que foi
   descartado de propósito.
4. Conferir que o log do **worker** sai em JSON (uma linha por evento), não só o da API.

## Implementado com dois ajustes achados no teste manual

1. **`RETRYABLE_EXCEPTIONS` precisou incluir `ConnectionError` (builtin do Python)**, além de
   `OperationalError`/`InterfaceError`/`RedisConnectionError`. Medido derrubando o container do
   Postgres de verdade: quando a falha acontece no `connect()` cru (socket recusado), o asyncpg
   nunca chega a embrulhar em `OperationalError` — o SQLAlchemy propaga
   `ConnectionRefusedError` (subclasse de `ConnectionError`) direto. Sem esse ajuste, exatamente
   o cenário que esta task existe pra tratar caía no ramo "erro de programação" e era descartado
   sem retry. Trancado com um teste de regressão em `test_tasks_retry.py`.
2. **`structlog.configure` precisou do processor `structlog.processors.format_exc_info`** antes
   do `JSONRenderer`. Sem ele, `log.error(..., exc_info=True)` serializava só `"exc_info": true`
   no JSON — o traceback inteiro se perdia, o oposto do que a task pede.

## Testes automatizados
- `tests/ingest/test_tasks_retry.py`: monkeypatch do sessionmaker pra levantar
  `OperationalError` nas 2 primeiras chamadas e suceder na 3ª; afirmar que a task conclui e que
  a linha foi gravada.
- Afirmar que `ValidationError` **não** dispara retry (contador de tentativas fica em 1).
- `tests/test_logging_config.py`: afirmar que importar `src.celery_app` já deixa o structlog
  configurado (renderer é `JSONRenderer`), sem passar por `src.main`.
