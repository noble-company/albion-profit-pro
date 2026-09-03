# 06 — Rate limit e hardening dos endpoints de leitura

> Corrige `S02`, `S04` e `S05`. Decide `S03`.

## Objetivo

Impedir que um usuário autenticado derrube a API, e fechar as folgas de configuração que hoje
dependem de ninguém errar o `.env`.

## Por que

`/opportunities/*` é o endpoint mais caro do sistema e **não tem rate limit nenhum** — só
`Depends(current_active_user)`. Como o registro é aberto, qualquer pessoa cria conta e derruba a
API com um laço de `curl`. Enquanto as tasks 02 e 03 não reduzem o custo, isso é trivial; mesmo
depois delas, um endpoint de ranking merece limite.

`CORSMiddleware` roda com `allow_credentials=True` e `cors_origins` vindo direto do ambiente,
**sem validador** — ao contrário de `trusted_proxy_cidrs`, que rejeita `0.0.0.0/0` de forma
exemplar. Um `CORS_ORIGINS=["*"]` em produção passa despercebido e vira eco de origem com
credenciais.

`POST /auth/tokens` não tem teto: um usuário pode gerar tokens indefinidamente.

## O que implementar

1. Aplicar `rate_limit` nos endpoints de leitura caros (`/opportunities/*`, `/craft/simulate`,
   `/craft/compare`), identificando **pelo usuário autenticado**, não por IP — vários jogadores
   legítimos podem sair do mesmo NAT, mesmo racional já usado no ingest.
2. Escolher explicitamente o comportamento com Redis fora do ar em cada rota (`fail-open` ou
   `fail-closed`), seguindo o padrão já estabelecido em `src/rate_limit.py`.
3. Adicionar `field_validator` em `Settings.cors_origins`: rejeitar `*` e qualquer entrada sem
   esquema quando `environment != "development"`. Mesmo espírito do validador de CIDR.
4. Definir e aplicar um teto de tokens ativos por usuário em `POST /auth/tokens`, com mensagem
   clara e orientação para revogar antes de criar outro.
5. **Decidir `S03`** e registrar a decisão nesta task: manter o JWT em `sessionStorage`
   assumindo o risco de XSS, ou migrar para transporte por cookie `httpOnly`+`SameSite`
   (`fastapi-users` suporta `CookieTransport`). Se a decisão for manter, documentar o porquê e
   as mitigações (CSP, ausência de HTML cru, revisão de dependências).

## Depende de

Task 01. Independente de 02-05; pode avançar em paralelo.

## Testes automatizados

- Exceder o limite em `/opportunities/flips` devolve 429 e não executa a consulta.
- Dois usuários diferentes têm buckets independentes; o mesmo usuário compartilha o bucket
  entre réplicas simuladas.
- `CORS_ORIGINS=["*"]` com `environment=production` falha na inicialização do `Settings`.
- Criar tokens além do teto devolve erro claro, e os tokens existentes seguem válidos.
- Toda chave nova de rate limit tem TTL, inclusive sob concorrência.

## Testes manuais

Rodar o laço de requisições contra a API atrás do Traefik real e conferir os 429, junto de
`SCAN rl:*` no Redis, confirmando que nenhuma chave contém identidade sensível.

## Estado da implementação

Concluída em 2026-08-31.

### 1–2. Rate limit dos endpoints caros

`rate_limited_user(bucket, limit, seconds)` em `src/rate_limit.py` — resolve `current_active_user`
e identifica por `user:{id}` (não por IP; mesmo racional do ingest). A chave de
`enforce_rate_limit` já inclui o path, então cada rota tem bucket próprio por usuário.

- `/opportunities/{flips,refining,crafting}` — `rl:opportunities`, **60 / 60s** por usuário por
  rota (dependency no router).
- `/craft/{simulate,compare}` — `rl:craft`, **30 / 60s** por usuário por rota.
- **`fail-open`**: a autenticação (Postgres) já aconteceu; uma queda do Redis não deve derrubar a
  leitura, e o limite existe para cortar loop sustentado. Registrado explicitamente na
  assinatura de `rate_limited_user`.

### 3. Validador de `cors_origins`

`field_validator` em `Settings.cors_origins`: com `environment != "development"`, rejeita `"*"` e
qualquer entrada sem esquema `http(s)://` ou sem host. Em desenvolvimento continua permissivo.
`.env.example` atualizado.

### 4. Teto de tokens de API

`MAX_ACTIVE_TOKENS_PER_USER = 10` em `src/api_tokens/service.py`. `create_token` conta os ativos
(`revoked_at IS NULL`) e levanta `TokenLimitReached`; o router devolve **409** com mensagem
orientando a revogar antes de criar outro. O frontend (`tokens/pages.tsx`) passa a exibir o
`detail` da API no toast. Revogar um token libera espaço imediatamente.

### 5. Decisão `S03` — transporte do JWT

**Mantido em `sessionStorage`**, migração para cookie `httpOnly` adiada para o pré-lançamento
(junto da task 10), pelos motivos:

- O frontend inteiro é reescrito no BLOCO 4; refazer o fluxo de auth agora seria trabalho
  perdido, e a task 16 (restauração de sessão) já vai mexer nessa camada.
- Cookie `httpOnly` traz CSRF de volta como problema — precisa de `SameSite` + double-submit ou
  token de CSRF, o que é uma mudança de escopo maior do que "trocar o storage".

**Mitigações vigentes enquanto continua em `sessionStorage`:**

- `sessionStorage` (não `localStorage`): o token some ao fechar a aba, não persiste entre
  sessões nem é compartilhado entre abas.
- App React sem `dangerouslySetInnerHTML` e sem renderização de HTML cru de terceiros — o vetor
  clássico de XSS que leria o storage.
- Sem dependências de terceiros injetando script em runtime (bundle fechado por Vite).
- **Pendência pré-lançamento**: header CSP restritivo no serving (task 19) e revisão de
  dependências. A reavaliação cookie vs. storage acontece com a task 10.

### Testes

- `uv run pytest tests/ -q` → **331 passed**. `uv run ruff check .` → limpo.
- `tests/opportunities/test_rate_limit.py` (novo): 429 em `/opportunities/flips` **não executa**
  a query · buckets por usuário · chave nova tem TTL · anônimo recebe 401 antes do 429.
- `tests/test_config.py`: `CORS_ORIGINS=["*"]`/sem-esquema + `environment=production` falha no
  `Settings`; origem completa passa; `*` continua ok em desenvolvimento.
- `tests/auth/test_router.py::test_api_token_cap_per_user`: 11º token → 409 claro, os 10 seguem
  ativos, revogar um libera espaço.
- `test_incremento_concorrente_sempre_cria_ttl` (pré-existente) cobre o TTL sob concorrência do
  mecanismo compartilhado.
- Frontend `npm run lint && npm run typecheck && npm run test` → 0 erros, 24 verdes.
