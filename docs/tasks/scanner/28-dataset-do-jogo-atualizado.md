# 28 — Dataset do jogo atualizado

## Objetivo

Atualizar o dataset estático (`items.json`, `ITEM DUMP.json`, `world.json`) para a revisão atual do
jogo, e fazer a semeadura **mover o histórico da API pública** quando o jogo renumera os itens.

## Por que

Achado `W9`, na validação da task 23: o histórico do nosso client estava atribuído ao item errado.
O livro de ordens chega com o nome do item; o histórico, com o `AlbionId` numérico, resolvido pelo
`Index` do `items.json` do dataset — que era a revisão de **27/07** (`5cf2e8e9`).

Confirmado com o `items.json` da revisão de **08/09** (`0be6a5e7`), antes de mexer em nada:

| | Dataset de 27/07 | Dataset de 08/09 |
|---|---|---|
| Índices que apontam para outro item | — | **12.049 de 12.071** |
| Varreduras de histórico com o mesmo item do livro a menos de 90 s | 43 de 440 | **310 de 440** |
| Pares item × cidade com preço do histórico coerente com o de mercado (0,5×–2×) | 25 de 337 | **373 de 382** |
| Razão mediana preço do histórico ÷ preço de mercado | 0,25 | **0,94** |

As 130 varreduras que ainda não casam são o limite do método: o livro mais próximo nem sempre é o
do gráfico aberto, quando o jogador passa por vários itens.

### O que se corrige sozinho e o que não

- **O histórico do client se corrige sozinho.** O banco guarda o `AlbionId` cru do jogo; com o
  `items.json` certo, a mesma linha passa a apontar para o item certo.
- **O histórico da API pública não.** A API fala o nome do item, e a task 23 gravou o número que o
  dataset de 27/07 dava ao nome. Com o dataset novo esse número aponta para outro item. Sem mover
  essas linhas, a correção só trocaria qual das duas fontes está errada. E o problema volta a cada
  patch que renumerar o jogo — então a correção mora na semeadura, não num script de uma vez.

## Decisões com o usuário (2026-09-11)

| # | Decisão |
|---|---|
| 1 | Atualizar o dataset para a revisão do jogo, com o download das três fontes (~42 MB). |
| 2 | A inversão da precedência ("a API vence o client") era para o intervalo até o dataset ser atualizado. Como o dataset certo corrige o client, **ela deixa de ser necessária**: a regra da task 23 continua. |

## O que implementar

1. **Manifesto** para a revisão `0be6a5e74f30fc1312118be3d017f3832f027cef`: URLs, tamanhos e
   SHA-256 das três fontes, e as contagens esperadas medidas pelo plano de importação real:

   | Contagem | Antes | Agora |
   |---|---|---|
   | `source_items` | 12.071 | 12.237 |
   | `imported_items` | 12.062 | 12.228 |
   | `skipped_long_item_names` | 9 | 9 |
   | `recipes` | 8.433 | 8.548 |
   | `skipped_multiple_recipes` | 339 | 339 |
   | `recipes_without_item_id` | 39 | 39 |
   | `curated_locations` | 9 | 9 |

2. **Semeadura move o histórico da API pública.** Na mesma transação que troca os itens: para cada
   nome cujo `albion_id` mudou, as linhas `source='aodp'` passam para o número novo. No bloco que o
   client já tem com o número novo, o client continua vencendo. O histórico do client não é tocado.
3. **Os dumps da raiz** (fora do git, `.gitignore`) passam a ser os da revisão nova, para os scripts
   que leem de lá (`import_recipes`, `import_items`) não voltarem ao dataset velho.
4. **No banco local:** semeadura, rollup, e conferir de novo as duas medidas acima.

## Depende de

Task **23** (a coluna `source` e o histórico da API pública).

## Testes automatizados

- A semeadura move o bloco `aodp` para o número novo do mesmo nome.
- No bloco que o client já tem com o número novo, o client continua.
- O histórico do client não é tocado.
- Os testes de semeadura que já existem continuam passando.

## Testes manuais

1. Na tela, conferir que o preço médio e o volume de um item que o client varreu batem com o jogo.
2. No jogo, abrir o histórico de um item e comparar com a coluna Vende/dia.

## Estado da implementação

**Concluída (2026-09-11).**

- **Manifesto** (`backend/datasets/albion-static-2026-08-23.json`) na revisão `0be6a5e7`, versão
  `2026-09-11-0be6a5e7-artifact-route-v1`. A `transform_revision` não muda: a transformação é a
  mesma, só a fonte avançou.
- **`remapear_historico_da_api`** (`backend/src/prices/history.py`), chamada por `apply_dataset`
  (`backend/scripts/seed_static_data.py`) antes de `apply_item_import`, na mesma transação. Monta
  o par número antigo → número novo por nome numa tabela temporária (dois arrays, não um
  parâmetro por par — achado `W8`), tira as linhas `aodp` dos números antigos e devolve com o
  novo, `ON CONFLICT DO NOTHING`.
- **Nome que saiu do dataset** perde o histórico da API: o número dele pode ser de outro item
  agora. Não estava na spec; surgiu na revisão antes de rodar no banco, e ganhou guard próprio.
- **Guards** (`backend/tests/static_data/test_seed_remap_history.py`): nasceram vermelhos (2 de 3
  falhando antes da implementação; o do client passava por construção, porque é o comportamento
  que já existia). Com o de item removido, 4 verdes.
- **Dumps da raiz** trocados pelos da revisão nova (SHA-256 conferido contra o manifesto).

### No banco local

| Medida | Antes | Depois |
|---|---|---|
| Semeadura | — | 137 s, 12.228 itens, 8.548 receitas |
| Linhas `aodp` em `market_history_entry` | 2.301.599 | 2.278.346 (23.253 caíram em bloco do client ou em item que saiu) |
| Itens distintos com histórico `aodp` | 6.795 | 6.795 |
| Linhas `aodp` sem item correspondente | — | 0 |
| Rollup diário e mensal refeito | — | 38,8 s |
| Pares item × cidade × qualidade do client, 30 dias, preço do histórico entre 0,5× e 2× do de mercado | — | **106 de 109**, razão mediana **0,95** |

A medida da última linha é a do banco, com o dataset aplicado; a da tabela de "Por que" foi feita
sobre as varreduras cruas antes de mexer em nada. As duas concordam: o histórico do client voltou a
falar do item certo.
