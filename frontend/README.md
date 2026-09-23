# Albion Profit Pro — frontend

SPA React/Vite da calculadora de crafting e refino.

## Requisitos

- Node.js `20.19+` ou `22.12+` (recomendado: linha LTS 22).
- npm 10 ou mais recente.
- Navegador moderno compatível com Tailwind CSS 4: Safari 16.4+, Chrome 111+ ou Firefox 128+.

O React Router 8 requer Node 22.22 ou superior. Enquanto o ambiente do projeto estiver no Node
22.15, o scaffold usa a última versão compatível da linha 7.

## Ambiente

Copie `.env.example` para `.env.local` se precisar mudar a URL da API. O valor de desenvolvimento
é `VITE_API_BASE_URL=http://localhost:8000`.

## Comandos

```bash
npm install
npm run dev
npm run build
npm run preview
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

`npm run api:types` gera o contrato OpenAPI versionado da API.

Para regenerar o contrato com outro backend, use `API_BASE_URL=http://localhost:8000 npm run api:types`.
O cliente tipado fica em `src/api/`; o token é fornecido pela futura camada de autenticação via
`setAccessToken`, e respostas 401 são observáveis por `subscribeUnauthorized` sem dependência
circular com o AuthProvider.

## Produção (task 3.6/13)

`frontend/Dockerfile` builda a SPA e serve o resultado com `nginx-unprivileged` (não-root, porta
8080). O `VITE_API_BASE_URL` de produção é fixado como `/api` **dentro do Dockerfile** (não em
`.env.production`) — front e API ficam atrás do mesmo host no Swarm
(`backend/stack.production.example.yml`), com o Traefik removendo o prefixo `/api` antes de
encaminhar pro serviço `api`. Isso fecha CORS em produção sem tocar em nenhuma rota do backend.
Esse valor não afeta `npm run dev`/`npm run build` locais nem o build que a suíte E2E usa
(`npm run preview`), que continuam absolutos contra `http://localhost:8000`.

`frontend/nginx.conf` serve `/assets/*` (arquivos com hash do Vite) com cache imutável de um ano
e 404 real se o arquivo não existir; qualquer outra rota cai em `index.html` com `Cache-Control:
no-cache`, para o roteamento do React Router funcionar sem expor uma rota desconhecida como 404
nem servir HTML velho.
