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
