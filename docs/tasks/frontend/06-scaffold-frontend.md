# 06 — Scaffold do frontend

## Objetivo
Criar a aplicação React/Vite estrita e o harness de qualidade.

## Por que
`frontend/` ainda não existe. A fundação precisa evitar divergência de tipos e versões desde o
primeiro componente.

## O que implementar
- Revalidar versões estáveis e compatibilidade com Node instalado; criar React 19 + Vite 8 +
  TypeScript 5.9, React Router 8, Tailwind 4 via `@tailwindcss/vite` e shadcn/ui. Travar tudo no
  lockfile, sem ranges flutuantes para majors.
- `strict`, `noUncheckedIndexedAccess`, ESM, aliases e estrutura por domínio:
  `src/{api,auth,tokens,items,prices,craft,components/ui,lib,routes}`.
- ESLint, Prettier, Vitest, Testing Library, jsdom e scripts `dev`, `build`, `preview`, `lint`,
  `typecheck`, `test`, `test:e2e`, `api:types`.
- `VITE_API_BASE_URL=http://localhost:8000` no exemplo; documentar Node suportado, comandos e
  requisitos de navegador do Tailwind 4.
- App mínimo acessível, CSS carregado e provider de testes compartilhado.

## Bibliotecas/dependências
As listadas acima; registrar a versão exata escolhida na própria spec se a implementação divergir.

## Depende de
Nenhuma task da Fase 3.

## Testes manuais
`npm run dev`, conferir Tailwind e console do navegador sem erros.

## Testes automatizados
`npm run lint`, `typecheck`, `test` e `build`; smoke test renderiza `<App />`.
