# 07 — Guards de frontend que realmente guardam

> Corrige `E10`.

## Objetivo

Fazer os testes que a task 3.5/26 (`F12`) instalou medirem o que dizem medir. Hoje eles passam
com o defeito `E01` no repositório.

## Por que

A Fase 3.5 entregou 15 guards em `frontend/src/test/` e um gate de cobertura com piso alto. O
conjunto é bom — e mesmo assim `E01`, `E02`, `E03`, `E04` e `E05` passaram por todos eles. Vale
entender por quê, guard a guard.

**Cobertura mede o lugar errado.** `frontend/vite.config.ts:23-29` inclui `src/lib/**`,
`src/api/**`, `src/**/hooks.ts`, `src/**/service.ts` e `useOpportunityParams.ts` — cerca de 25 de
85 arquivos-fonte. Fora do gate ficam:

- `src/opportunities/production-pages.tsx` — **o arquivo onde `E01` mora**
- `src/api/query.ts` (excluído em `:32`) — política de retry, que o próprio comentário do arquivo
  chama de lógica
- `src/design/confidence.ts`, `src/i18n/categories.ts`, `src/auth/forms.ts`
- toda a leitura de URL, coerção e montagem de request das telas

O `include` foi desenhado em torno de **nomes de arquivo**, não de "onde há lógica". Vários
desses arquivos até têm teste (`production-pages.test.tsx` tem 7); só não são medidos nem
travados.

**Vetores dourados cobrem uma forma só.** `backend/tests/fixtures/golden/projection-vectors.json`
tem 8 vetores, e 7 usam exatamente o mesmo bloco `components`, variando só os parâmetros. Não há
vetor para `expected: null` (todos os lados nulos, `ranking-projection.ts:150`), para
`roi === null` (custo zero, `:119-124`), nem para `applyProjection` (`:183-186`), que tem só 4
testes artesanais. E nada detecta fixture desatualizado: se `ranking_service.py` mudar e ninguém
rodar `generate_projection_vectors.py`, os dois lados divergem em silêncio — o cenário exato que
o cabeçalho de `ranking-projection.ts:12-13` diz impedir.

**A11y audita tela vazia.** `src/test/a11y.test.tsx:23-91` monta as 6 telas com todos os
handlers MSW devolvendo lista vazia, e **fora do `AppShell`**. O `axe` nunca vê linha de tabela,
`DetailDrawer` aberto, paginação, KPI preenchido, `WarningBadges` nem o gráfico (o mock de
`/demand` devolve 422). Só `serious`/`critical` reprovam (`:104-107`), então `region`,
`heading-order` e `landmark-unique` passam calados. Login e Registro não são auditados.

**`no-icon-chars` é lista fechada.** `:7-9` tem 8 code points. Setas (`→ ←`), checks (`✓ ✔`),
triângulos, `⚠`, `•` e qualquer emoji passam. Hoje não há violação — mas o invariante é falso.

**A regra de dinheiro é estrutural.** `eslint.config.js:35-43` casa `Number(x.profit)` para uma
lista fixa de 21 campos, e só quando o `MemberExpression` é argumento direto. Não pega `+x`,
`x * 1`, `Number.parseFloat(...)`, `x['profit']`, variável intermediária, nem
`Number(x.profit ?? '0')`. E a lista não inclui `recipe_silver_cost`, `silver_cost`,
`neutral_profit` nem `neutral_roi`.

## O que implementar

1. Redesenhar o `include` de cobertura por **onde há lógica**, não por nome de arquivo. No mínimo:
   `production-pages.tsx`, `api/query.ts`, `design/confidence.ts`, `auth/forms.ts` e os leitores
   de parâmetro das páginas. Remedir e reajustar o piso ao valor real — o ratchet desce uma vez,
   documentadamente, e volta a subir.
2. Ampliar `projection-vectors.json` e o gerador: `expected: null`, `roi: null`,
   `return_rate` nos extremos (`0` e `1`), `executions`/`recipe_silver_cost` variando, e vetores
   próprios para `applyProjection`.
3. Travar o fixture contra desatualização: gravar no JSON um hash do código gerador (ou dos
   parâmetros de geração) e um teste que falhe quando o Python mudar sem regenerar.
4. `a11y.test.tsx`: montar as telas **com dados**, dentro do `AppShell`, com o `DetailDrawer`
   aberto em pelo menos um caso, incluir Login e Registro, e reprovar também `moderate`.
5. `no-icon-chars`: trocar a lista negra por faixa Unicode (`\p{So}`, `\p{Sm}`) com allowlist
   explícita de `×`, `…` e `—`.
6. Ampliar a regra `no-restricted-syntax` para `UnaryExpression` (`+x`), operações aritméticas
   sobre campo monetário e os campos que faltam; e escrever um teste que prove que a regra
   dispara (hoje não existe).

## Depende de

Tasks 01-04 — a cobertura nova tem que medir o código já corrigido, senão o piso é fixado sobre
o defeito.

## Testes automatizados

- Reverter localmente a correção da task 01 faz o gate de cobertura **ou** um teste falhar. Se
  passar verde, a task 07 não terminou.
- O teste de fixture desatualizado falha ao mexer no gerador sem regenerar.
- `a11y` com dados reprova uma violação `moderate` plantada de propósito.
- A regra de lint acusa `+row.profit` e `Number(row.recipe_silver_cost)`.

## Testes manuais

Nenhum — esta task é inteiramente de verificação automatizada.
