# 33 — Hardening da camada HTTP

> Corrige **A2**, **A3**, **A6** e **P8** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).

## Objetivo
Fechar as pontas soltas da borda HTTP antes de o backend ficar exposto: CORS, vazamento de erro
interno, payload sem limite, login sem freio e senha sem política.

## Por que

**CORS (A2)** — `settings.cors_origins` existe em `src/config.py:25`, está no `.env.example` e
nos testes, e **ninguém lê**. Não há `CORSMiddleware` em `src/main.py`. A Fase 3 quebra no
primeiro request do navegador, e é o tipo de erro que custa uma tarde pra diagnosticar porque
parece problema de rede.

**`/ready` (A3)** — `src/main.py:52,58` devolve `f"erro: {e}"` num endpoint sem autenticação.
Erro de asyncpg/redis carrega host, usuário e nome do banco. O orquestrador só precisa do
status code; o detalhe pertence ao log.

**Payload sem limite (A6)** — `Orders` é lista ilimitada, e o payload inteiro vira uma mensagem
RabbitMQ. Um client defeituoso (ou hostil, com token válido) derruba o broker. A captura real
mostra lotes de ~50 ordens; um teto de 5.000 é folgado e ainda protege.

**Login sem freio (A6)** — `/auth/login` aceita tentativas ilimitadas.

**Senha (P8)** — `UserManager` não implementa `validate_password`, então `"senha123"` (6
caracteres) é aceito — e é literalmente o que os testes usam.

## O que implementar

### 1. CORS
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
`allow_origins=["*"]` **não** pode ser usado junto de `allow_credentials=True` (o navegador
rejeita) — a lista explícita do settings é o caminho certo. Registrar no `.env.example` que em
produção precisa conter o domínio real do frontend.

### 2. `/ready` sem detalhe
Resposta passa a ser `{"postgres": "ok"|"erro", "redis": "ok"|"erro"}` e o status code (200/503)
carrega a informação. A exceção completa vai pro log estruturado (task 24), com `exc_info`.

### 3. Limite de payload
Duas camadas, porque protegem coisas diferentes:
- **Schema**: `orders: list[MarketOrderIn] = Field(alias="Orders", max_length=5000)` — dá 422
  claro e não ocupa o broker.
- **Middleware**: rejeitar `Content-Length` acima de ~10 MB com 413, antes de o corpo ser
  parseado. Sem isso, um JSON gigante consome CPU/memória só pra ser rejeitado depois.

### 4. Rate limit
`slowapi` (wrapper de `limiter` pra Starlette, mantido e simples) com Redis como backend — já
temos Redis, e o limite precisa valer entre réplicas.
- `/auth/login` e `/auth/register`: algo como 10/min por IP.
- Endpoints de ingest: limite por **token**, não por IP (vários usuários podem sair do mesmo
  NAT). Generoso — o client legítimo é falador.

> Antes de fixar os números, medir com o client real: a captura mostrou 4 POSTs em ~10 s numa
> única visita ao mercado. Um limite apertado demais quebra o produto silenciosamente.

### 5. Política de senha
`UserManager.validate_password`: mínimo 10 caracteres, rejeitar senha que contenha o e-mail.
Não inventar regra de complexidade (símbolo obrigatório etc.) — comprimento é o que importa.
Atualizar os testes que usam `"senha123"`.

Enquanto estamos aqui: `reset_password_token_secret` e `verification_token_secret` reusam o
`jwt_secret` (`src/auth/manager.py:12`). Separar em settings próprios, com default derivado do
`jwt_secret` pra não quebrar ambiente existente.

## Bibliotecas/dependências
- `slowapi` — avaliar maturidade/compatibilidade no momento de implementar, conforme a
  convenção do projeto de não trocar biblioteca sem diligência.

> **Nota de implementação (2026-08-22):** nem `slowapi` nem `fastapi-limiter` acabaram
> usados. `slowapi` está sem release há mais de 2 anos (diligência inicial). Cheguei a
> integrar `fastapi-limiter` 0.2.0 (`pyrate-limiter` por baixo) — ativamente mantido — mas
> rodando de verdade apareceram dois problemas reais: (1) `Limiter.try_acquire_async` tem
> `blocking=True` por padrão, então ao bater no limite ele **espera** até uma vaga abrir
> (até 60s) em vez de rejeitar na hora — quase passou despercebido porque nenhum teste
> falhava, só a suíte ficou 7x mais lenta; (2) `RedisBucket` aplica a taxa ao bucket inteiro
> (`bucket_key`), não por identificador — dois IPs diferentes competem pelo mesmo
> orçamento, a menos que cada um ganhe seu próprio bucket físico via uma `BucketFactory`
> customizada. Dado que o requisito real é só "contar e comparar com um teto, por
> identificador, numa janela", implementei um contador de janela fixa direto em Redis
> (`INCR`+`EXPIRE`, ver `src/rate_limit.py`) — sem dependência nova, sem os dois problemas
> acima, trivial de testar. Testes usam um `X-Forwarded-For` sintético único por fixture
> `client` (`tests/conftest.py`) pra não colidirem entre si no rate limit por IP.
> `max_length` (item 3) também foi aplicado em `histories`/`prices`/`timestamps`
> (`markethistories.ingest`/`goldprices.ingest`), não só `orders` — mesmo risco A6, a spec
> só citava `orders` explicitamente.

## Depende de
Task 24 (o log estruturado é pra onde o detalhe do `/ready` vai).

## Testes manuais
1. `curl -H "Origin: http://localhost:5173" -X OPTIONS ...` → cabeçalhos CORS presentes.
2. `docker compose stop postgres`, `GET /ready` → 503, corpo **sem** DSN/host, e o detalhe
   presente no log.
3. POST de ingest com 6.000 ordens → 422.
4. 20 tentativas de login em sequência → 429 a partir do limite.
5. Registrar com senha `"senha123"` → 400 com mensagem clara.

## Testes automatizados
- Preflight CORS devolve `access-control-allow-origin` pra origem configurada e **não** pra uma
  origem estranha.
- `/ready` com dependência derrubada: status 503 e afirmar que o corpo **não contém** a string
  da `DATABASE_URL`.
- Payload acima do `max_length` → 422.
- Rate limit dispara 429 (usando um limite baixo via override de settings no teste).
- `validate_password` rejeita curta e a que contém o e-mail; aceita uma válida.
