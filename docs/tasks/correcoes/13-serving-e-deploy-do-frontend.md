# 13 — Serving e deploy do frontend

> Corrige `P01`. Assume a parte de implementação da
> [task 3/19](../frontend/19-build-validacao.md).

## Objetivo

Dar ao frontend um caminho de produção — imagem, serving e roteamento no Swarm — para que a task
19 da Fase 3 possa ser o que o nome diz: o ensaio integrado em jogo.

## Por que

Não existe caminho de deploy do frontend. Verificado:

- `find . -iname "Dockerfile*"` acha `backend/Dockerfile` e os do fork Go. **Não há Dockerfile em
  `frontend/`.**
- `backend/stack.production.example.yml` tem `migrate`, `seed`, `api`, `worker-ingest`,
  `worker-maintenance`, `worker-quarantine` e `beat`. Nenhum serviço servindo a SPA, nenhuma
  label de Traefik pro front.

Enquanto isso, a spec da task 19 (`tasks/frontend/19-build-validacao.md:7-9`) pede exatamente
isso:

> - Build multi-stage único para frontend/API/worker/migrations.
> - Serving da SPA com fallback apenas para HTML e assets com cache correto.
> - Base URL de mesma origem em produção e CORS apenas no desenvolvimento.

Ou seja: a task 19 é tratada em `CLAUDE.md:29` e no `README.md:165-167` como "validação humana em
jogo", mas contém código não escrito. Enquanto isso não for separado, o gate final fica
permanentemente fora de alcance — e a Fase 4, que carrega "a mesma URL do frontend" dentro de um
webview (`00-plano-macro.md:249`), não tem URL para carregar.

O precedente do projeto para essa situação é a task 3.5/27, que assumiu a task 18 da Fase 3.

## O que implementar

1. `frontend/Dockerfile` multi-stage: build Vite e serving estático, usuário não-root, como
   `backend/Dockerfile` já faz (`:17` cria `app` com uid 10001).
2. Serving com **fallback só para HTML** — rota desconhecida devolve `index.html`, mas asset
   inexistente devolve 404, e não o HTML (senão o navegador tenta interpretar HTML como JS).
   Cabeçalhos de cache: imutável e longo para `assets/*` com hash, curto e revalidado para
   `index.html`.
3. **Base URL de mesma origem em produção.** Hoje `VITE_API_BASE_URL` aponta para
   `http://localhost:8000` em dev (`frontend/README.md:17-18`). Em produção, front e API atrás do
   mesmo host tornam o CORS desnecessário — o que também fecha a superfície de `S04`.
4. Serviço `frontend` no `stack.production.example.yml`, com as labels de Traefik no padrão dos
   demais serviços e roteamento coerente com a decisão do item 3 (path prefix para `/api` ou
   host separado — decidir e documentar).
5. Estender o `backend-ci.yml` (ou criar workflow próprio) para buildar a imagem do frontend e
   verificar o contrato dela, como o job `migrations-and-image` já faz com a do backend.
6. Atualizar `tasks/frontend/19-build-validacao.md` com nota de reconciliação: a implementação
   saiu para cá, a 19 fica sendo o ensaio integrado. Mesmo formato da nota que a 3.5/27 deixou
   sobre a task 18.

## Depende de

Tasks 01-04 (não faz sentido publicar as telas com os defeitos de usuário abertos) e task 12
(a E2E é o que dá confiança para publicar).

## Testes automatizados

- Build da imagem do frontend passa e roda como usuário não-root.
- Rota desconhecida devolve `index.html` com 200; `/assets/nao-existe.js` devolve 404.
- Cabeçalhos de cache conferem por tipo de recurso.
- Com front e API na mesma origem, uma requisição da SPA não dispara preflight CORS.

## Testes manuais

Subir a stack completa localmente com o serviço de frontend e navegar pelas seis telas servidas
pelo bundle de produção — não pelo `vite dev`.

## Estado da implementação

**Concluída** (2026-09-22). `npm run lint && npm run typecheck && npm run test` (594 testes) e o
build da imagem verificados manualmente contra os 4 critérios da spec, replicados no CI.

- **`frontend/Dockerfile`** — multi-stage: `node:22-alpine` builda com `npm ci` (com `.npmrc`
  copiado antes — sem ele o `ERESOLVE` do `W6`, openapi-typescript vs. TypeScript 6, derruba o
  build) e `VITE_API_BASE_URL=/api` fixado só nesta imagem; runtime é
  `nginxinc/nginx-unprivileged:1.27-alpine` (porta 8080, uid 101 — não-root sem gambiarra de
  permissão em cima do nginx oficial).
- **`frontend/nginx.conf`** — `location /assets/` com `try_files $uri =404` e cache imutável de
  1 ano; `location /` com fallback pra `index.html` e `Cache-Control: no-cache`.
- **`frontend/.dockerignore`** — exclui `node_modules`, `dist`, `coverage`, relatórios de teste;
  **mantém `e2e/`** porque `tsconfig.e2e.json` é referenciado pelo `tsc -b` do build (excluir a
  pasta quebra o build com `TS18003`).
- **Decisão de roteamento (item 3/4 da spec): prefixo `/api` na borda, via Traefik, sem tocar em
  nenhuma rota do backend.** `backend/stack.production.example.yml` ganhou o serviço `frontend`
  (`Host(APP_HOST)`, prioridade 1) e um **segundo router** no serviço `api` já existente —
  `Host(APP_HOST) && PathPrefix('/api')`, prioridade 10, com middleware
  `stripprefix.prefixes=/api` — que aponta pro mesmo `service=profitpro-api` de sempre. O
  router original (`Host(API_HOST)`, usado pelo client Go desde a Fase 2) não foi tocado.
  Motivo de não usar subdomínio: a spec pede "mesma origem" explicitamente, e subdomínio é
  origem diferente (ainda dispararia CORS). Motivo de não prefixar as rotas do backend: seria
  mudança de contrato, fora do escopo desta task.
- **`.github/workflows/frontend-ci.yml`** — novo job `image`: builda a imagem, confirma
  `Config.User == "101"`, espera o healthcheck, e reproduz os 4 testes automatizados da spec
  (fallback 200, asset 404, headers de cache por tipo, ausência de `localhost:8000` no bundle).
- **`frontend/README.md`** e **`docs/tasks/frontend/19-build-validacao.md`** — documentam a
  decisão e a reconciliação (mesmo formato que a 3.5/27 deixou sobre a 18).

### Desvios da spec

- **O teste "SPA não dispara preflight CORS" foi verificado de forma estrutural, não por uma
  requisição real.** Como o `VITE_API_BASE_URL=/api` é relativo, toda chamada da SPA em
  produção é, por construção, mesma origem — não há como um preflight CORS acontecer. O CI
  confirma isso indiretamente: nenhum bundle de produção contém `localhost:8000` (a única URL
  absoluta que o cliente HTTP conhece) e o bundle principal contém a string `/api`. Simular o
  preflight de verdade exigiria subir a stack completa (API + Traefik) em CI, fora do escopo de
  um job de imagem.
- **`APP_HOST` é uma env nova** (a spec não nomeia a variável) — segue o padrão de
  `API_HOST`/`CORS_ORIGINS` já usados no arquivo (`${VAR:?mensagem}`).

### Pendente pra você testar

- **Subir a stack completa localmente com o serviço de frontend** (o teste manual da spec):
  buildar `backend` e `frontend`, definir `BACKEND_IMAGE`/`FRONTEND_IMAGE`/`APP_HOST`/`API_HOST`
  e demais segredos, subir via `docker stack deploy` (ou um `docker compose` equivalente pra
  teste local) e navegar pelas seis telas — Market Flip, Refino, Craft, Calculadora, Preços e
  Meus Crafts — servidas pelo bundle de produção, confirmando que `/api/...` responde e que o
  DevTools não mostra nenhuma requisição de preflight `OPTIONS`.
- **CI:** confirmar o job `image` verde no GitHub Actions (não rodei `act` localmente, só validei
  os mesmos comandos manualmente contra a imagem).
