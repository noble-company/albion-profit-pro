# 26 — Testes proporcionais no frontend

> Corrige `F12`.

## Objetivo

Ter cobertura onde está a lógica, para que a próxima refatoração não seja feita no escuro.

## Por que

O frontend tem **24 testes em 9 arquivos** para 5.220 linhas de aplicação. O backend tem 258
testes para 6.524 linhas. A diferença não é só de volume — é de **onde** a cobertura está:

- auth e formatters concentram quase tudo;
- `opportunities/pages.tsx` e `production-pages.tsx` somam 1.561 linhas e têm 205 linhas de teste;
- não há teste de ordenação, paginação, filtro, sincronia com URL ou dos hooks de dados;
- não há E2E (task 27).

E há o problema qualitativo já documentado em `F07`: um teste que passa por causa de um mock
permissivo, escondendo um bug real de produção. Volume de teste não substitui teste honesto.

## O que implementar

1. **Handlers MSW honestos** (iniciado na task 16): exigir `Authorization` nas rotas
   autenticadas, validar os parâmetros de query recebidos e devolver payloads no formato exato do
   OpenAPI. Um handler que ignora a requisição é um teste que não testa.
2. **Isolamento entre casos:** `queryClient` novo por teste (hoje `src/test/render.tsx` usa o
   singleton da aplicação) e reset do estado de sessão do módulo.
3. Testes para a lógica que hoje está descoberta:
   - módulo monetário e vetores dourados (task 18) — a peça mais crítica;
   - projeção "e se" do cliente (task 23), comparada ao backend;
   - sincronia de filtros com a URL, ida e volta;
   - paginação: primeira página, última, além do fim, conjunto vazio;
   - estados de borda: sem cobertura, dado velho, profundidade insuficiente, erro de rede,
     429, sessão expirada no meio da navegação;
   - hooks de dados: dedup, cache, cancelamento no desmonte, polling só com aba visível.
4. Definir e medir uma meta de cobertura para os módulos de lógica (`lib/`, `api/`, hooks),
   sem perseguir número em componente de apresentação.
5. Adicionar ao CI a execução de `lint`, `typecheck` e `test` do frontend, se ainda não houver.

## Depende de

Tasks 15-25.

## Testes automatizados

Esta task **é** os testes. O critério de pronto:

- Cada teste novo é verificado vermelho antes de ficar verde (escrito contra o defeito, não
  depois da correção).
- Nenhum handler MSW responde a requisição autenticada sem checar credencial.
- Cada caso roda isolado: a suíte passa com `--sequence.shuffle`.
- A meta de cobertura definida é atingida nos módulos de lógica.

## Testes manuais

Nenhum. A validação é a suíte.
