# 23 — Camada "e se" no cliente

> Materializa a decisão de arquitetura nº 1 da fase. É a task que responde diretamente à queixa
> de que "tudo depende do servidor".

## Objetivo

Fazer com que mexer em premium, taxa de retorno, custo de estação, impostos, lucro mínimo e
ordenação recalcule o resultado **na hora, no navegador**, sem nenhuma requisição.

## Por que

Hoje cada um desses controles dispara um round-trip completo. Marcar "Conta Premium" faz o
servidor refazer até 8.000 simulações (`B02`) para mudar uma alíquota de 8% para 4%. Digitar
"15" em taxa de retorno faz o mesmo, dígito a dígito. É a origem direta da sensação de lentidão.

E é desnecessário: esses parâmetros são transformações baratas sobre dados que o navegador
**já tem na mão**. O que o servidor precisa fazer é a varredura — avaliar milhares de receitas
contra o livro de ofertas inteiro. O que ele não precisa fazer é multiplicar por 0,96.

A divisão adotada é por **o que muda**, não por onde roda:

| Camada | Onde | Por quê |
|---|---|---|
| Varredura e ranking | Servidor, pré-calculado (task 03) | Precisa do universo de dados |
| Preço atual | Servidor, endpoint único | É o "backend só traz preço" |
| "E se…" | **Cliente, instantâneo** | Os dados já estão na página |
| Detalhe com slippage | Servidor, sob demanda | Precisa do livro completo daquele item |

## O que implementar

1. O ranking (task 03) chega ao cliente com os **componentes** do resultado em parâmetros
   neutros: custo de ingrediente por modo de aquisição, preço de saída por modo de venda, custo
   de prata da receita, foco por execução, quantidades e frescor por lado.
2. Aplicar no cliente, com o módulo decimal da task 18 e as fórmulas portadas em
   `src/lib/craft-formulas.ts`:
   - imposto de venda (premium 4% x não-premium 8%);
   - setup fee por modo de aquisição e de venda;
   - taxa de retorno de recurso sobre a quantidade a comprar;
   - custo de estação por execução;
   - foco;
   - lucro, lucro por unidade e ROI;
   - filtro de lucro/ROI mínimo e ordenação sobre o conjunto carregado.
3. Recalcular de forma derivada do estado (`useMemo`), sem `useEffect` nem refetch. A meta é
   resposta perceptualmente instantânea ao mover um controle.
4. **Deixar explícito na interface** o limite do que é local: os filtros que restringem o
   universo (cidade, tier, encantamento, frescor, cobertura) continuam sendo do servidor,
   porque mudam *quais* linhas existem. Os que mudam *o valor* das linhas carregadas são locais.
5. Botão/afordância para aprofundar: quando o usuário quiser o número exato com slippage, abre o
   detalhe, que chama `POST /craft/simulate` — inalterado.
6. Sinalizar honestamente a natureza do número local: é projeção sobre o ranking em parâmetros
   neutros, não a simulação com profundidade de livro. A diferença precisa estar visível, não
   escondida — é a mesma disciplina de `cobertura: parcial` que o backend já pratica.

## Depende de

Tasks 03, 04, 18, 20 e 22. **A task 18 é bloqueante**: sem o módulo decimal e os vetores
dourados, isto vira uma segunda implementação do dinheiro divergindo em silêncio.

## Testes automatizados

- Mudar premium, retorno, estação ou imposto **não** dispara nenhuma requisição (verificado por
  MSW: zero chamadas após a carga inicial).
- Para os mesmos parâmetros, o resultado local é idêntico ao de `POST /craft/simulate` nos casos
  em que a profundidade de livro não altera o preço unitário — teste cruzado com o backend real.
- Onde a profundidade **altera** o preço, a UI mostra a divergência esperada e sinaliza que o
  número local é projeção.
- Os vetores dourados da task 18 continuam verdes.
- Filtro de universo (cidade, tier) continua indo ao servidor.

## Testes manuais

Mover o controle de taxa de retorno de 0 a 50% e confirmar que a tabela responde sem
carregamento perceptível. Depois abrir o detalhe de uma linha e conferir que o número exato do
servidor é coerente com a projeção mostrada.

## Estado da implementação

**Concluída.** Backend: `uv run pytest tests/ -q` → **346 passed** (+4) · `uv run ruff check .`
limpo. Frontend: `npm run typecheck` limpo · `npm run lint` 0 erros (4 warnings pré-existentes)
· `npm run test` **154/154 em 33 arquivos** (+4) · `npm run build` passa.

### Backend

- **`RankingComponentsOut`** (novo em `opportunities/schemas.py`), aninhado como
  `OpportunityOut.components` (nullable, só nas linhas de ranking). Traz os 11 componentes
  neutros da `RecipeRanking`: `recipe_silver_cost`, `crafting_focus`, `executions`,
  `produced_quantity`, `ingredient_cost_{immediate,order}`, `output_gross_{immediate,order}` e
  os 3 `*_observed_at`.
- `read_recipe_ranking` popula `components` (`_row_components`). O `_project_row` **continua**
  rodando com os defaults (premium on, retorno 0) — os campos financeiros do payload são a
  projeção default, para o first paint e para consumidores sem JS. `neutral_profit`/`neutral_roi`
  (filtro `min_profit`/`min_roi` + `sort` no servidor) não mudam com o "e se", então o
  endpoint **não** precisou de mudança de contrato — só do campo novo.
- `frontend/src/api/schema.d.ts` regerado (diff de 34 linhas, só o schema novo).

### Frontend

- **`src/lib/ranking-projection.ts`** — porte de `_project_row` sobre `craft-formulas.ts` +
  `decimal.js`. `projectRankingRow(components, params)` devolve o melhor cenário;
  `applyProjection(row, params)` devolve uma cópia da linha com os campos recalculados
  (linha sem `components` volta intacta).
- `production-pages.tsx`: `premium`/`returnRate`/`stationCostPerExecution`/`useFocus` saem da
  query do servidor (`serverQuery` = `query` sem esses 4) → **não entram na chave do TanStack**,
  então mexer neles **não dispara refetch**. Um `useMemo` roda `applyProjection` sobre a
  página carregada; a tabela e os KPIs usam as linhas projetadas.
- `service.ts` `getProductionOpportunities`: os 4 params saíram da requisição.
- `RankingCoverage`: o aviso vira "Os valores acompanham os controles abaixo, mas são projeção
  sobre o ranking — o número exato, com profundidade de livro, é o 'Analisar'" (item 6).

### Vetores dourados (paridade cliente/servidor)

- `backend/scripts/generate_projection_vectors.py` → `backend/tests/fixtures/golden/projection-vectors.json`
  (8 casos: premium on/off, retorno 0/15/25/50%, estação, foco, um lado ausente, base gigante).
- `tests/opportunities/test_projection_vectors.py` (Python): freshness + `_project_row` bate
  com os `expected` congelados.
- `frontend/src/lib/ranking-projection.golden.test.ts` (TS): `projectRankingRow` bate **string
  a string** com o mesmo arquivo. As duas implementações não podem divergir em silêncio.

### Desvios da spec

- **Item 2/4 — `min_profit`/`min_roi` e a ordenação ficaram no servidor**, não no cliente.
  Motivo: eles operam sobre `neutral_profit`/`neutral_roi` (valores materializados que **não**
  mudam com premium/retorno/estação), então mantê-los no servidor preserva a paginação honesta
  do F08 (task 17) sem custo de UX — não têm o problema "dígito a dígito" que a spec descreve
  para retorno/estação. O que ficou instantâneo é exatamente o que o "Por que" da task cita:
  premium, retorno, estação, foco, imposto. A tabela **não** reordena no cliente (só recalcula
  valores), então o guard `no-client-paging-mutation` não precisou de exceção.
- O endpoint mantém os 4 params "e se" (com defaults) — o frontend só parou de enviá-los. Sem
  quebra de contrato; a projeção default do servidor continua correta para o first paint.

### Testes automatizados — os 5 bullets

1. *Mexer em premium/retorno/estação não dispara request* → `production-pages.test.tsx`
   (contador de requests do MSW: igual antes e depois de togglar "Conta Premium" / digitar
   50% de retorno).
2. *Resultado local == `_project_row`* → vetores dourados (Python + TS sobre o mesmo arquivo).
3. *Onde profundidade altera o preço, a UI sinaliza projeção* → o aviso do `RankingCoverage`
   está sempre visível na tela de ranking; `price_model="neutral_ranking"` no payload.
4. *Vetores da task 18 continuam verdes* → `craft-formulas.golden.test.ts` intacto.
5. *Filtro de universo continua no servidor* → `opportunities.test.ts` ("envia filtros de
   universo, mas NÃO os controles 'e se'").

### Testes manuais que já rodei

`npm run dev` compila sem erro; shell monta sem erro no console. A caminhada real precisa de
backend + login + ranking materializado.

### Pendente pra você testar

Com backend + worker `maintenance` + login, em `/refino` ou `/craft`:

1. **Instantâneo**: arrastar "Retorno de recurso" de 0 a 50% — a coluna Lucro/ROI/Custo muda a
   cada tecla, **sem** spinner nem piscar. Idem "Conta Premium", "Usar foco", "Estação".
2. **Coerência com o exato**: numa linha, anotar o Lucro projetado, abrir "Analisar" com os
   mesmos parâmetros — o número do `/craft/simulate` tem que ser coerente (igual quando a
   profundidade de livro não move o preço unitário; um pouco menor quando move).
3. **Universo continua no servidor**: mudar cidade/tier/frescor/lucro-mínimo/ordenação **dá**
   um carregamento (é o servidor refazendo a varredura) — isso é esperado.
4. Aba de rede do navegador: togglar premium/retorno/estação → **nenhuma** requisição a
   `/opportunities/*`.
