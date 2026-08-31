# 06 — Scaffold do frontend

## Objetivo
Criar a aplicação React/Vite estrita e o harness de qualidade.

## Por que
`frontend/` ainda não existe. A fundação precisa evitar divergência de tipos e versões desde o
primeiro componente.

## O que implementar
- Revalidar versões estáveis e compatibilidade com Node instalado; baseline revisada em 2026-08-23:
  React 19 + Vite 8 + TypeScript 6 + React Router 8, Tailwind 4 via `@tailwindcss/vite` e
  shadcn/ui. Usar releases estáveis compatíveis no dia da implementação e travar tudo no lockfile,
  sem ranges flutuantes para majors.
- `strict`, `noUncheckedIndexedAccess`, ESM, aliases e estrutura por domínio:
  `src/{api,auth,tokens,items,prices,craft,components/ui,lib,routes}`.
- ESLint, Prettier, Vitest, Testing Library, jsdom e scripts `dev`, `build`, `preview`, `lint`,
  `typecheck`, `test`, `test:e2e`, `api:types`.
- `VITE_API_BASE_URL=http://localhost:8000` no exemplo; documentar Node suportado, comandos e
  requisitos de navegador do Tailwind 4.
- App mínimo acessível, CSS carregado e provider de testes compartilhado.

## Bibliotecas/dependências
Versões diretas fixadas no scaffold em 2026-08-23: React/React DOM `19.2.8`, Vite `8.2.2`,
TypeScript `6.0.3`, React Router `7.18.2`, Tailwind CSS/`@tailwindcss/vite` `4.3.3`, Vitest
`4.1.11` e Playwright `1.62.1`; as demais versões exatas estão no `frontend/package.json` e no
lockfile. O React Router `8.3.0` está estável, mas exige Node `>=22.22.0`; como a máquina de
desenvolvimento usa Node `22.15.0`, foi mantida a última versão compatível da linha 7. O
TypeScript `6.0.3` é a última versão suportada pelo `typescript-eslint 8.67.0` (`<6.1.0`), portanto
o TypeScript 7 não foi adotado ainda.

## Depende de
Nenhuma task da Fase 3.

## Testes manuais
`npm run dev`, conferir Tailwind e console do navegador sem erros.

## Testes automatizados
`npm run lint`, `typecheck`, `test` e `build`; smoke test renderiza `<App />`.
