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
