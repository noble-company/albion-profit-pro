# 07 — Camada de API tipada

## Objetivo
Gerar tipos do OpenAPI e centralizar transporte/erros/autenticação.

## Por que
Tipos redigitados escondem drift do Pydantic. O backend já possui erros reais com formatos
diferentes que precisam de uma borda única.

## O que implementar
- `openapi-typescript` gera e commita `src/api/schema.d.ts`; script recebe URL configurável e falha
  de forma legível se a API não estiver disponível.
- Preferir um cliente tipado estabelecido compatível com o schema (ex.: `openapi-fetch`) em vez de
  casts manuais. Wrapper injeta JWT e sinal de aborto.
- Normalizar 400/401/403/404 semântico/413/422/429/503 e falha de rede numa união discriminada sem
  perder `detail`.
- 401 notifica o AuthProvider uma vez por onda de falhas; não cria dependência circular.
- Configurar QueryClient: retry só para falhas transitórias idempotentes, nunca 4xx; políticas de
  stale/refetch por domínio, não um valor global para tudo.
- MSW e handlers base reutilizáveis.

## Bibliotecas/dependências
`openapi-typescript`, `openapi-fetch`, TanStack Query 5 e MSW.

## Depende de
Tasks 05 e 06, para gerar o contrato completo.

## Testes manuais
Subir backend, regenerar schema e executar uma chamada autenticada.

## Testes automatizados
Header presente/ausente, query/path/body tipados, formatos de erro, 401 concorrente uma vez,
cancelamento e política de retry.

## Implementação concluída em 2026-08-23

- Dependências fixadas no frontend: `openapi-typescript@7.13.0`, `openapi-fetch@0.17.0`,
  `@tanstack/react-query@5.101.4` e `msw@2.15.0`.
- `scripts/api-types.mjs` agora busca `${API_BASE_URL}/openapi.json`, gera
  `src/api/schema.d.ts` e falha com mensagem acionável quando a API não está disponível.
- O schema foi gerado contra o backend local real e contém as APIs das Tasks 01–05, incluindo
  `/craft/compare`.
- `src/api/client.ts` centraliza `openapi-fetch`, injeta Bearer JWT, preserva `AbortSignal` e
  transforma respostas não-2xx em `ApiError` discriminável (`http`, `network`, `aborted`), sem
  perder `detail` nem permitir retry de 4xx permanentes.
- `src/api/session.ts` fornece token desacoplado e consolida respostas 401 concorrentes em uma
  notificação por onda, deixando o `AuthProvider` da Task 08 como consumidor futuro.
- `src/api/query.ts` configura TanStack Query 5: duas tentativas apenas para falhas transitórias,
  mutations sem retry e políticas de stale/refetch separadas por domínio.
- MSW foi integrado ao setup compartilhado; os testes cobrem JWT, query/path/body tipados, erro
  429, rede/cancelamento, 401 concorrente e política de retry.
- Testes reais: `npm test -- --run` (5 testes), `npm run typecheck`, `npm run lint`,
  `npm run format:check` e `npm run build` passaram.

## Desvios e compatibilidade

- `openapi-typescript@7.13.0` declara peer de TypeScript `^5.x`, enquanto a Task 06 fixa
  TypeScript `6.0.3`. Mantivemos TypeScript 6 por ser a decisão do scaffold e instalamos o gerador
  com `legacy-peer-deps`; geração, typecheck e build passaram sem casts ou erros.
- A integração de sessão continua desacoplada por contrato (`setAccessToken`/
  `subscribeUnauthorized`); login, persistência e logout pertencem à Task 08.
