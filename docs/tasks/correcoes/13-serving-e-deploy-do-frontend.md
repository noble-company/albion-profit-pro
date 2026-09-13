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
