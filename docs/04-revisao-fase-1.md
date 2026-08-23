# Revisão da Fase 1 (backend) — achados

> Revisão completa de `backend/` feita em **2026-08-22**, logo após a Fase 1 ser marcada como
> concluída (22/22 tasks, 51 testes verdes). Escopo: bugs, erros de implementação, código
> repetitivo e desvios de padrão.
>
> Cada achado tem um identificador estável (`C1`, `A3`, `M7`, `N2`…) que as tasks 23-36
> referenciam. Este documento é o registro do *diagnóstico*; o *tratamento* está em
> [tasks/backend/](tasks/backend/README.md).

## Conclusão geral

**A implementação é fiel às specs.** Em vários pontos ela é literalmente o bloco de código do
`docs/tasks/backend/NN-*.md`. Os problemas mais graves **nascem nas specs**, não de descuido na
hora de codar — por isso as correções atualizam doc e código juntos.

O ponto estruturante: **o caminho de escrita do ingest nunca rodou de verdade.** Os testes
chamam as corotinas internas (`_process_market_orders`) diretamente, e o teste de router só
publica na fila sem worker consumindo. Os 51 testes verdes não cobrem o wrapper Celery — que é
justamente onde está o bug mais grave (C1).

Somado a isso, a Fase 1 inteira foi construída contra payloads inventados. Quando o jogo real
foi capturado (ver [03-contrato-ingest-real.md](03-contrato-ingest-real.md)), apareceram três
problemas semânticos que nenhuma revisão de código pegaria — os achados `N1`-`N3` abaixo.

---

## 🔴 Crítico — quebra ou corrompe dados em produção

### C1 — Worker Celery quebra a partir da 2ª task
`src/ingest/tasks.py:12` faz `asyncio.run(coro)` **por task** (um event loop novo a cada
mensagem), mas `src/database.py:10` cria o engine no import do módulo com o pool padrão
(`AsyncAdaptedQueuePool`) e `src/cache/redis_client.py:9` mantém um `Redis` global com pool
próprio. Quando a task 1 termina, o loop fecha e as conexões asyncpg voltam **abertas** pro
pool, amarradas a um loop morto. A task 2, no loop novo, recebe uma delas → `RuntimeError: ...
attached to a different loop` / `Event loop is closed`.

O próprio projeto já documentou esse comportamento: `pyproject.toml:39` explica que um loop por
teste "quebraria esses singletons no 2º teste em diante". Os testes contornam com loop único de
sessão; o worker em produção faz exatamente o contrário.

**Status:** alta confiança por análise; **falta confirmação empírica** com worker real (ver
task 23, seção de testes).
→ **task 23**

### C2 — `market_order` grava duplicata sem limite
`src/ingest/tasks.py:44` é `INSERT` puro e a tabela não tem constraint única
(migration `754507d56907`). A spec 17 dizia "upsert em lote"; só o histórico ganhou
`ON CONFLICT`.

**Medido no jogo real:** uma visita ao mercado de ~10 s produziu **194 linhas para 97 ordens
reais (2,0×)** — o mesmo lote reenviado com `Id`s idênticos.
→ **task 27**

### C3 — Cache e leitura misturam compra e venda
A chave `price:{item}:{cidade}:{qualidade}` (`src/cache/redis_client.py:19`) ignora
`auction_type` e `enchantment_level`. O fallback Postgres (`src/prices/service.py:20`) também:
pega "a ordem mais recente", de qualquer lado.

**Medido:** no algodão T2, `offer` ficou em 37–39 silver e `request` entre **1** e 35. O preço
cacheado pode virar 1 silver e a calculadora reportar lucro infinito.
→ **task 29**

### C4 — O "melhor preço" é só o primeiro do lote
`src/ingest/tasks.py:47` comenta "melhor preço", mas o `seen`/`continue` guarda a **primeira**
ordem da combinação — ordem arbitrária do payload. `tests/ingest/test_tasks.py:75` inclusive
*afirma* esse comportamento.
→ **task 29**

### C5 — `scope=mine` é ignorado com cache quente
`src/prices/service.py:14` lê o cache **antes** de aplicar o filtro de escopo. O teste que
"prova" isolamento só passa porque usa item aleatório e cache frio.
→ **tasks 29 e 30**

### C6 — `process_gold_prices` descarta em silêncio
`src/ingest/tasks.py:102` tem corpo vazio (`...`) e o router responde 200. **Decisão do
usuário (2026-08-22): gold price fica fora de escopo por enquanto** — mas parar de descartar
calado (logar explicitamente) entra na task 24.
→ **task 24**

---

## 🟠 Alto — segurança e operação

| ID | Achado | Onde | Task |
|---|---|---|---|
| A1 | **Tokens de API em texto plano no banco**, com lookup pelo valor cru. Um dump do Postgres entrega todos os tokens funcionando. | `src/api_tokens/models.py:16`, `service.py:23` | 32 |
| A2 | **CORS nunca foi ligado.** `settings.cors_origins` existe e ninguém lê; não há `CORSMiddleware`. O frontend da Fase 3 quebra no primeiro request. | `src/config.py:25`, `src/main.py` | 33 |
| A3 | **`/ready` vaza detalhe interno** (`f"erro: {e}"`) sem autenticação — erros de asyncpg/redis carregam host, usuário e nome do banco. | `src/main.py:52,58` | 33 |
| A4 | **Imagem de produção não roda migration**: `alembic` está em `[dependency-groups] dev` e o Dockerfile faz `uv sync --frozen --no-dev`. | `pyproject.toml:47`, `Dockerfile:6,9` | 34 |
| A5 | **Falha na task = dado perdido**: sem `autoretry_for`, `max_retries`, try/except ou log. Com `acks_late`, exceção ainda dá ack. | `src/ingest/tasks.py` | 24 |
| A6 | **Sem limite de payload e sem rate limit.** `Orders` é lista ilimitada e vai inteira pra uma mensagem RabbitMQ; `/auth/login` não tem proteção contra brute force. | `src/ingest/router.py`, `src/auth/router.py` | 33 |

---

## 🟡 Médio — arquitetura e performance

| ID | Achado | Task |
|---|---|---|
| M1 | **`GET /items/{id}/prices` faz até 80 round-trips**: loop 8 cidades × 5 qualidades = 40 `GET` no Redis + até 40 queries sequenciais (`src/prices/service.py:11`). Pela spec 18, é o endpoint mais chamado do sistema. | 29 |
| M2 | **Todos os timestamps são `TIMESTAMP WITHOUT TIME ZONE`** — causa raiz do `datetime.now(timezone.utc).replace(tzinfo=None)` em `src/api_tokens/service.py:52`. | 25 |
| M3 | **`expires` guardado como `String(32)`** (`src/prices/models.py:30`) — impossível filtrar ordem expirada em SQL. | 25 |
| M4 | **Import de receitas não é idempotente**: `output_item_unique_name` é único, a 2ª execução estoura `IntegrityError` e aborta tudo. `ITEM_DUMP_PATH` é relativo ao CWD (`scripts/import_recipes.py:8`). | 35 |
| M5 | **`is_public` é coluna morta** — existe nas duas tabelas e nas migrations, nenhuma query lê ou escreve. | 30 |
| M6 | **Constantes de domínio hardcoded na camada de serviço**: `LOCATIONS` (com TODO admitindo IDs não confirmados) e `range(1,6)` em `src/prices/service.py:7`. | 28 |
| M7 | **Unicidade do histórico inclui `user_id`** — N usuários enviando o mesmo dado autoritativo do servidor = N linhas idênticas. | 26 |

---

## 🔵 Padronização, organização e duplicação

| ID | Achado | Task |
|---|---|---|
| P1 | **Arquivos vazios/mortos**: `src/exceptions.py` (nunca importado) e `src/recipes/router.py` (vazio, não registrado). `recipes/` não tem `schemas.py`/`service.py` — quebra o layout domain-driven. | 36 |
| P2 | **Camada de serviço inconsistente**: `prices`/`api_tokens` têm `service.py`; `ingest` põe lógica de banco em `tasks.py`; `recipes` põe em `scripts/`. | 36 |
| P3 | **structlog configurado e nunca usado** — zero chamadas `log.` em `src/`. E o `structlog.configure()` mora em `src/main.py`, que o **worker Celery nunca importa**. | 24 |
| P4 | **Duplicação pesada nos testes**: `_unique_email()` copiado em 5 arquivos, `_create_test_user` em 3, cleanup manual `try/finally` em quase todo teste. A fixture `db_session` (`tests/conftest.py:89`) é declarada e nunca usada. | 36 |
| P5 | **Testes sem isolamento real** — dependem de IDs aleatórios num banco compartilhado em vez de rollback por teste. | 36 |
| P6 | **Migrations com lixo de autogenerate** — marcadores `please adjust!` e `import fastapi_users_db_sqlalchemy` não usado em 5 arquivos, silenciado por per-file-ignore do ruff. | 36 |
| P7 | **Dockerfile**: roda como root; `COPY --from=builder /app/.venv` seguido de `COPY --from=builder /app /app` (redundante); sem `HEALTHCHECK`, `PYTHONUNBUFFERED`, `PYTHONDONTWRITEBYTECODE`. | 34 |
| P8 | **`UserManager` sem política de senha** — sem `validate_password`, `"senha123"` é aceito. `reset_password_token_secret` e `verification_token_secret` reusam o `jwt_secret`. | 33 |
| P9 | **`scripts/` sem `__init__.py`** e importando `src.*` — só executável a partir de `backend/`. | 35 |

---

## 🟣 Achados de dado real (não visíveis no código)

Vieram da captura ao vivo — detalhe completo em
[03-contrato-ingest-real.md](03-contrato-ingest-real.md).

| ID | Achado | Task |
|---|---|---|
| N1 | **Prata vem ×10.000** (167/167 múltiplos exatos). O backend grava cru, sem documentar. Toda conta de lucro erra por 4 ordens de grandeza. | 25 |
| N2 | **`Timescale` não é identidade** — escalas 1 e 2 são a mesma série (29/29 pontos idênticos); buckets de 1 h somam exatos nos de 6 h. Um usuário abrindo as três abas grava 29 linhas duplicadas. A identidade correta é `bucket_seconds`. | 26 |
| N3 | **`LocationId` não é numérico** — veio `"1000-HellDen"`. A lista `LOCATIONS` hardcoded nunca casaria, e `String(16)` é apertado. | 28 |
| N4 | **`Expires` tem precisão variável** (24, 25 ou 26 caracteres) — parser precisa aceitar 0 a 6 casas decimais. | 25 |
| N5 | **Bug no fork Go**: `log.Fatal` numa entrada malformada derruba o client inteiro (`operation_auction_get_offers.go:47`), enquanto o handler irmão de *requests* usa `log.Errorf`. Corrigido com patch local. | Fase 2 |
| N6 | **O client descarta tudo até ver uma transição de zona.** Iniciado com o jogador parado na cidade, `IsValidLocation()` é falso e nada sobe — só um `ERRO` no log. Usuários vão bater nisso direto. | Fase 2/3 |

---

## Decisões de produto tomadas nesta revisão

Registradas aqui porque mudam o modelo de dados:

1. **Dados são sempre globais.** O que um usuário coleta entra no acervo comum. `scope=mine` é
   um filtro de *procedência*, não um silo separado — implementado por uma tabela de cobertura
   (`market_scan`), não duplicando linhas por usuário. Isso torna `is_public` (M5) sem sentido.
   → tasks 26, 27, 30
2. **Histórico de 30 dias + rollup mensal** é o objetivo de produto. Com `Timescale=2` dando 28
   dias a 6 h de resolução num único scan, isso sai mais barato e mais granular do que o
   previsto. → tasks 26, 31
3. **A feature-alvo é demanda × oferta lado a lado**: quanto foi realmente vendido nas últimas
   24 h (histórico, bucket de 1 h) somado ao que está no livro agora (profundidade dos dois
   lados, com preço e quantidade). → tasks 29, 31
4. **Gold price fica fora de escopo** até ser priorizado. → task 24
