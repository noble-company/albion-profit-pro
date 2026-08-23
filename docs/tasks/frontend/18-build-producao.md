# 18 — Build de produção e serving

## Objetivo
Produzir uma imagem única de API/SPA sem quebrar worker, migrate ou desenvolvimento.

## Por que
Servir a SPA no FastAPI simplifica mesma origem, mas o Dockerfile atual usa `backend/` como contexto.
Copiar o frontend exige mudar conscientemente o contexto e os scripts de validação; um
`frontend/Dockerfile` isolado não consegue montar a imagem Python.

## O que implementar
- Decisão inicial: build multi-stage a partir da raiz do monorepo (Node gera `dist`; Python instala
  backend; runtime recebe ambos). Atualizar comando documentado, `.dockerignore` e
  `scripts/check_image.sh`; API, worker e migrate continuam usando a mesma imagem.
- FastAPI monta assets somente quando presentes e por último. Implementar fallback de SPA apenas
  para requests HTML sem extensão; API desconhecida continua 404 JSON, não `index.html`.
- Produção usa base URL de mesma origem; desenvolvimento continua CORS/Vite.
- Cache forte para assets com hash e no-cache para `index.html`; headers básicos de segurança sem
  bloquear Vite/dev.
- Se o `stack.yml` real exigir serviço estático separado, registrar desvio e adaptar nesta task,
  não antes de conhecer o padrão do usuário.

## Bibliotecas/dependências
Starlette `StaticFiles` ou resposta equivalente já disponível; Node/Python nas stages.

## Depende de
Task 17 e compartilhamento das convenções reais de deploy antes de finalizar a decisão.

## Testes manuais
Build da raiz, rodar imagem, atualizar rota profunda e executar API/worker/migrate da mesma imagem.

## Testes automatizados
Backend: health/API/404 JSON/fallback HTML/assets. Frontend: build. `check_image.sh` atualizado prova
usuário não-root e três comandos. Smoke Docker separado da suíte pytest.
