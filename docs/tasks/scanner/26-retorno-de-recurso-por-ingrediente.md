# 26 — Retorno de recurso por ingrediente

## Objetivo

O retorno de recurso passa a valer **só para o ingrediente que o jogo devolve**. Artefato, cristal,
token, capa base, livro e tudo que o dump marca como não retornável é comprado para **todas** as
execuções da sessão.

## Por que

Reportado pelo usuário (2026-09-10):

> A única coisa que retorna do craft é recurso refinado. Artefatos, cristais e qualquer outro item
> que não seja do refino não retorna na taxa de retorno.

Analisado contra o dump e o código:

- **O dump marca quem não retorna:** `craftresource/@maxreturnamount="0"`, em 2.516 dos 7.874
  ingredientes. Nenhum recurso refinado leva a marca, e nenhum ingrediente de refino.
- **O importador descarta a marca.** `extract_craft_resources` (`scripts/import_recipes.py:52`) lê
  nome, quantidade e encantamento. `docs/02-dados-de-receita.md` não documenta o atributo.
- **A tela aplica o retorno à receita inteira.** `producaoDaSessao` (`frontend/src/scanner/engine.ts`)
  conta `⌊N ÷ (1 − r)⌋` execuções e compra tudo para `N` — como se o artefato também voltasse.
- **O servidor desconta tudo.** `simulate_craft` usa `return_eligible = True` quando o pedido não
  diz (`craft/service.py:157`), e a tela nunca diz. A comparação (`compare_service.py:65`) idem.
- **Os vetores dourados travam cliente e servidor no mesmo erro.** A fórmula já aceita
  `return_eligible`; ninguém passa o valor a partir da receita.
- **1.356 das 5.366 receitas de craft** do catálogo têm pelo menos um ingrediente que não retorna
  (artefatos de Cristal e Fey, tokens de Avalon, capa base e brasão das capas de facção, livro das
  bolsas de discernimento, animais do cultivo). No refino, 0 — lá o cálculo de hoje está certo.

### O tamanho do erro, numa receita real

Cajado Arcano de Cristal T4 (20 tábuas, 12 barras, 1 artefato), 600 receitas, retorno 36,7%:

| | Hoje | Correto |
|---|---|---|
| Execuções (cajados) | 947 | 947 |
| Tábuas compradas | 12.000 | 12.000 |
| Barras compradas | 7.200 | 7.200 |
| **Artefatos comprados** | **600** | **947** |

A tela vende 947 cajados e cobra 600 artefatos: 347 artefatos de custo somem do lucro.

## Decisões já tomadas com o usuário (2026-09-10)

| # | Decisão |
|---|---|
| 1 | **Segue o dump.** Onde ele diverge da regra "só recurso refinado retorna", vale o dump: ingredientes de comida e poção (leite, carne, ovo, ervas, álcool) retornam, e almas e relíquias ao craftar artefato também. |
| 2 | **O retorno de quem retorna continua virando execução a mais, e quem não retorna é comprado para todas as execuções.** "Se o player for craftar 10 armas, e der pra craftar mais 1, mostrar que precisa comprar 11 artefatos." |

## A regra

`R` = ingredientes que retornam; `F` = os que não retornam (`@maxreturnamount="0"`).

**Sessão** — a tela, "Receitas a fazer" = `N`:

| | |
|---|---|
| Execuções `E` | `⌊N ÷ (1 − r)⌋` se a receita tem pelo menos um `R`; senão `N` |
| Compra de cada `R` | `quantidade × N` (como hoje) |
| Compra de cada `F` | `quantidade × E` |
| Rendimento | `E × amount_crafted` |

Taxa base 15,2%, 10 receitas: `E = ⌊10 ÷ 0,848⌋ = 11` — material refinado para 10, artefatos para
11. É o exemplo do usuário.

Por que o `R` comprado para `N` sustenta `E` execuções: cada `R` consome `quantidade × E`, devolve
`r × quantidade × E`, e o líquido `quantidade × E × (1 − r)` não passa de `quantidade × N` enquanto
`E ≤ N ÷ (1 − r)`. Receita sem nenhum `R` não tem o que devolver para pagar execução a mais.

**Meta de saída** — o servidor, `desired_output`, `Q` unidades:

| | |
|---|---|
| Execuções `E` | `⌈Q ÷ amount_crafted⌉` |
| Compra de cada `R` | `⌈quantidade × E × (1 − r)⌉` |
| Compra de cada `F` | `quantidade × E` |

É a fórmula que já existe (`calculate_ingredient_requirement`), com a elegibilidade vindo da
receita em vez de `True`.

## O que implementar

1. **Dado.** `recipe_ingredient.return_eligible` (booleano, não nulo, padrão verdadeiro), migração
   escrita à mão. O importador lê `@maxreturnamount` (`"0"` → falso). A elegibilidade é **por linha
   de ingrediente**, não por item: o mesmo item pode retornar numa receita e não em outra.
   Subir `STATIC_TRANSFORM_REVISION` e o manifesto — a semeadura pula quando o sha do manifesto não
   muda (`seed_static_data.py:249, 305`), e a coluna nova ficaria no padrão.
2. **Contrato.** `CatalogIngredientOut.return_eligible`. O `ETag` do catálogo muda sozinho com o
   formato (task 17), e o cliente sempre revalida (task 21).
3. **Servidor.** `simulate_craft` e a comparação usam o dado da receita como padrão; o
   `ingredient_overrides` manual continua vencendo.
4. **Engine do cliente.** A regra da sessão acima; no modo `desired_output`, `returnEligible` da
   receita na fórmula.
5. **Vetores dourados.** Regenerar com uma receita com artefato, nos dois modos.
6. **`docs/02-dados-de-receita.md`:** documentar `@maxreturnamount`.

## Depende de

Tasks **05** (engine), **06** (vetores dourados), **11.6** (sessão) e **12** (craft).

## Testes automatizados

- O importador grava `return_eligible = false` para ingrediente com `@maxreturnamount="0"` e `true`
  sem a marca — inclusive nos níveis encantados.
- O catálogo expõe o campo.
- Sessão: arma com artefato, 10 receitas, 15,2% → 11 execuções, material refinado para 10,
  artefato 11.
- Receita só com recurso refinado: o número é idêntico ao de hoje.
- Receita sem nenhum ingrediente que retorna: `E = N`.
- Servidor em `desired_output`: o artefato não tem desconto; o override continua vencendo.
- Vetores dourados cliente × servidor com uma receita de artefato.

## Testes manuais

1. Em `/craft`, Armas › Cajados arcanos, abrir o Cajado Arcano de Cristal T4: os artefatos da lista
   de compras batem com o Rendimento.
2. No jogo, craftar 10 unidades de um item com artefato na taxa base e conferir que sobra material
   refinado para o 11º.

## Estado da implementação

**Concluída.** Frontend `npm run test` **497/497** · `typecheck` limpo · `lint` 0 erros (7 avisos,
os mesmos). Backend `pytest tests` **427 passaram**, 1 falha que já existia
(`test_compare_query_count_does_not_grow_with_city_count`, a contagem de cidades com o mercado duplo
de Lymhurst, fora desta task) · `ruff` limpo.

### Guards vermelhos primeiro

- Backend, 17: importador (3), catálogo (1), `simulate_craft` (3), comparação (2) e paridade dos
  vetores (8). Os vetores 0 a 6 falharam só por a coluna ainda não existir; o que prova a regra é o
  **vetor 9**, com artefato.
- Frontend, 6: o dourado e 5 do engine. "Receita em que tudo retorna dá o número de hoje" passou
  contra o código antigo — é a trava de que o número não mudou onde não devia.
- Uma expectativa minha estava errada e foi corrigida: supus taxa de montagem na compra imediata
  do artefato. Ela é só da ordem de compra; o custo a mais é 11 × 9.500 = 104.500.

### Medido no banco local, depois de reimportar

- Craft: 2.077 linhas de ingrediente não retornam, em **1.375 receitas** (a análise estimou 1.356
  cruzando pelo dump; a diferença é o casamento de nomes, que a importação faz direito). Refino: 0.
- Cajado Arcano de Cristal T4: tábuas e barras retornam, o artefato não. Poção de cura T6: dedaleira,
  ovo e álcool retornam — é o dump, e foi a decisão 1.

### O que só apareceu implementando

- **O override zerava a marca.** `IngredientOverride.return_eligible` tinha padrão `True`: mandar só
  a qualidade de um ingrediente reescreveria a marca da receita e daria desconto ao artefato. Virou
  `bool | None`, com `None` = a receita decide. Travado no `simulate_craft` e na comparação.
- **O contrato de receita também leva a marca** (`RecipeIngredientOut.return_eligible`): é de lá
  que o `simulate_craft` lê a receita (`get_recipe_detail`).
- **Reimportação local sem baixar nada.** O `world.json` da raiz não é o do manifesto (20 MB contra
  91 KB), e a semeadura baixaria os três arquivos. As receitas foram reimportadas com
  `scripts.import_recipes`, que usa as mesmas funções da semeadura e os dumps da raiz — que batem em
  tamanho com o manifesto. O `transform_revision` e a versão do manifesto subiram, então a próxima
  semeadura de verdade reaplica.
- **O `ETag` do catálogo mudou pelo formato**, não pela versão do dataset (que só muda na
  semeadura): o campo novo no `CatalogIngredientOut` basta para o navegador baixar de novo.
- **Catálogo antigo no cache do navegador** não tem o campo: o engine lê ausente como "retorna", o
  comportamento de antes, até a revalidação trazer o novo.
- O tipo gerado marca `return_eligible` como obrigatório na resposta; dois testes de outras tasks
  montavam ingrediente sem ele e ganharam o campo.

### Pendente pra você testar

1. Em `/craft`, Armas › Cajados arcanos, abrir o Cajado Arcano de Cristal T4 com 10 receitas e
   retorno 15,2%: Rendimento 11, e na coluna Compra o artefato ×11 e as tábuas ×200.
2. Mudar para uma receita sem artefato (uma arma comum): o número de execuções continua o de antes.
3. No jogo, craftar 10 unidades de um item com artefato na taxa base e conferir que sobra material
   refinado para o 11º.
