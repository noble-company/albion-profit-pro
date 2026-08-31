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
