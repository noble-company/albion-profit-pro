# 05 — Isolamento da fonte no `scope=mine`

> Corrige `R05` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Fazer `scope=mine` respeitar separadamente a procedência do livro (`livro`) e do histórico
(`historico`).

## Por que

`MarketScan.fonte` faz parte da unicidade, mas os `EXISTS` das queries não a filtram. Um usuário
que coletou apenas histórico pode receber livro coletado por outra pessoa, e vice-versa.

## O que implementar

1. `_scan_exists_for_order` exige `fonte == "livro"`.
2. `_scan_exists_for_history` exige `fonte == "historico"`.
3. Centralizar os literais de fonte em enum/constantes tipadas compartilhadas; remover strings
   repetidas de services/tasks.
4. Auditar endpoints de preço e demanda para deixar explícito onde `scope` se aplica. Se demanda
   continuar global, documentar no contrato; não herdar `scope` parcialmente.
5. Após a task 03, o `EXISTS` também casa realm.

## Depende de

Nenhuma. A task 12 depende desta semântica corrigida.

## Testes automatizados

- Usuário com somente histórico não vê livro em `scope=mine`.
- Usuário com somente livro não recebe giro histórico em `scope=mine`.
- Usuário com ambas as coberturas recebe ambos; outro usuário continua isolado.
- Cache global quente nunca contorna o filtro.

## Testes manuais

Criar dois usuários, registrar fontes diferentes e comparar `scope=all`/`mine` por combinação.

