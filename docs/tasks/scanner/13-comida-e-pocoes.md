# 13 — Comida & Poções

## Objetivo

Uma aba própria para comida, poção e os insumos que a cozinha usa, sobre o mesmo motor — e a
taxa da estação certa nas poções, que hoje entra como zero em quase todas.

## Por que

### A aba

Comida e poção já eram calculadas, dentro de `/craft › Consumíveis`: 219 comidas e 172 poções, 353
das 391 com preço de venda em alguma cidade. Quem cozinha ou faz poção tinha que atravessar a árvore
do craft inteira, misturada com armas e armaduras, e os insumos da cozinha (molho de peixe, pão,
manteiga, carne) moravam em outras duas categorias.

### A taxa da estação (achado `W10`)

A taxa é cobrada por nutrição, e a nutrição sai do valor do item (task 18). O dump não publica
valor para poção; a derivação soma o valor dos ingredientes e **desistia** quando um deles não tinha
valor — o extrato arcano, que entra em toda poção encantada, e as partes de animal raro, que entram
em 8 tipos inteiros. Sem valor, `calculateStationFee` cobra zero:

| | Receitas | Sem valor |
|---|---|---|
| Poções | 172 | **153** |
| Comidas | 219 | 1 (item de evento) |

O lucro saía inflado justamente nas poções caras: a Poção de Cura T6.1 vende a 44 mil em Caerleon,
contra 12 mil a .0.

**Conferido no jogo** (2026-09-12), estação a 320 por 100 de nutrição — custo = valor × 0,1125 × 3,2
= valor × 0,36:

| Receita | Ingredientes com valor | Valor | × 0,36 | Jogo |
|---|---|---|---|---|
| Poção de Cura T4.1 | 24 bardana + 6 ovos a 40; extrato arcano **zero** | 1.200 | 432 | **432** |
| Poção de Fúria T4 | 16 bardana a 40; presa de lobisomem **zero** | 640 | 230,4 | **230** |

O jogo conta o ingrediente sem valor como **zero**. A premissa da task 18 ("ausente é ausente") era
defensável sem medida; com a medida, ela está errada.

## Decisões com o usuário (2026-09-12)

| # | Decisão |
|---|---|
| 1 | Os consumíveis **saem** de `/craft` e ficam só na aba nova. |
| 2 | Os insumos da cozinha **entram** na aba. |
| 3 | Ingrediente sem valor conta zero — medido na estação, ver acima. |
| 4 | Foco do Painel do Destino para culinária e alquimia fica para **outra task**, junto do craft. |

## O que implementar

1. **Derivação do valor** (`scripts/_item_values.py`): a receita que resolve inteira continua
   vencendo; se nenhuma resolve, vale a primeira, com o ingrediente sem valor contando zero. Nova
   revisão da transformação e do manifesto — o seed reaplica, os valores novos entram no catálogo.
2. **Aba `/consumiveis`** — "Comida & Poções" na navegação, a mesma tela do scanner sobre o catálogo
   de craft. Árvore de dois níveis, na ordem do bloco `shopcategories` do dump:
   - **Comida** › Sopas, Saladas, Tortas, Assados, Omeletes, Guisados, Sanduíches, Peixe grelhado
   - **Poções** › Cura, Energia, Crescimento, Resistência, Pegajosa, Venenosa, Invisibilidade,
     Calmante, Purificadora, Ácida, Fúria, Infernal, Coleta, Tornado, Salva-vidas
   - **Insumos** › Molho de peixe (`crafting/fish`), Produtos de fazenda (`farming/farmingproducts`:
     carne, manteiga, pão, farinha, aguardente)
   - **Outros** › Fogos de artifício (o resto de `consumables`)
3. **`/craft` sem o que mudou de aba** — nem na árvore, nem no Top 15, nem no "Todas", nem na busca.
4. **Recorte do snapshot e das vendas** (task 22/23) com `kind=consumables`, pela mesma regra no
   servidor. `Molho de peixe` usa o código `fishsauce`, não `fish`: o mapa de rótulos é plano, e
   `fish` já é "Pesca" na Coleta.

## Depende de

Task **12** (tela de Craft), **18** (taxa por nutrição) e **21** (árvore de categorias).

## Testes automatizados

- Contra o dump real: Poção de Cura T4.1 vale 1.200 e Poção de Fúria T4 vale 640 — os dois números
  da estação.
- A receita que resolve inteira continua vencendo a que tem ingrediente sem valor.
- A árvore da aba nova segue a ordem do jogo e junta os insumos; a do craft não tem mais
  consumíveis nem insumos.
- Todo código da árvore nova tem rótulo em português.
- `kind=consumables` no snapshot devolve as receitas da família, não as da comida.
- A navegação mostra "Comida & Poções".

## Testes manuais

1. Abrir **Comida & Poções**, escolher Poções › Cura e conferir a taxa da estação de uma poção
   encantada contra a janela da estação no jogo.
2. Conferir que `/craft` não mostra mais Consumíveis.

## Estado da implementação

**Concluída (2026-09-12).** Frontend `npm run test` **512/512** (71 arquivos) · `typecheck` limpo ·
`lint` 0 erros (7 avisos, os mesmos de antes). Backend `uv run pytest tests/` **454 passaram**, 1
pulado, 1 falha que já existia antes (`test_compare_query_count_does_not_grow_with_city_count`) ·
`ruff` limpo.

Guards vermelhos primeiro: 4 no backend (os dois do valor e os dois do recorte, que o `Literal`
recusava com 422) e 6 no frontend (5 da árvore, 1 da navegação). Dois nasceram verdes de propósito
e ficaram como trava: `a receita que resolve inteira continua vencendo` e o do ciclo — descrevem o
que **não** podia mudar.

### O que existe agora

| Camada | O que entrou |
|---|---|
| Dado | `_item_values.py`: ingrediente sem valor conta zero; receita inteira continua vencendo. Revisão `…-valueless-zero-v1` |
| API | `kind=consumables` em `/prices/snapshot` e `/prices/sales`; `insumos` › `fishsauce`, `farmingproducts` |
| Tela | `/consumiveis` — "Comida & Poções" na navegação, `ConsumablesScannerPage` |
| Árvore | `TelaDoScanner` em `categorias.ts`; `ORDEM_DOS_CONSUMIVEIS` do bloco `shopcategories`; o craft não alcança mais o que é de cozinha, nem pelo Top, nem pelo Todas, nem pela busca |

### Medido no banco local, depois do seed

| | |
|---|---|
| Valor que já existia e mudou | **0** |
| Valor que já existia e sumiu | **0** |
| Itens que ganharam valor | 893 (187 valem zero) |
| Poções sem valor | 153 → **0** |
| Poção de Cura T4.1 · Poção de Fúria T4 | **1.200 · 640** — × 0,36 = 432 e 230, os números da estação |
| Seed | 14 s (os `albion_id` não mudaram, o histórico não se move) |

### O que só apareceu medindo

- **A regra não é só das poções.** Das 542 saídas de receita que ganharam valor: 303 capas de
  facção (a capa base e a insígnia têm valor; o token de facção conta zero — Capa de Bridgewatch T4
  vale 160), 155 consumíveis, 25 bolsas, 21 trade packs (valem zero, como antes na prática), 17
  insumos de alquimia (zero) e alguns capacetes, armaduras e sapatos. Todos cobravam **zero** de
  estação no craft; agora cobram pela mesma regra que a estação confirmou nas poções. A conferência
  foi em poção, não em capa — é o primeiro lugar a olhar se uma capa não bater.
- **Fogos de artifício continuam sem valor**: as 8 receitas não têm ingrediente nenhum no dump. É o
  único caso em que `item_value` nulo sobra, e a tela continua sem cobrar taxa ali.
- **Os preços de consumível encantado existem.** A primeira contagem de cobertura dizia o contrário
  por um erro da consulta (comparava o nome sem o `@N` com o `item_id` do snapshot, que o tem).
  Refeita: 353 das 391 receitas com preço de venda em alguma cidade.
- **A alquimia não entrou na aba.** Extrato arcano e partes de animal raro (`crafting/alchemy`, 22
  receitas) seguem no Craft › Fabricação › Alquimia — a decisão cobriu molho de peixe e produtos
  de fazenda.

### Pendente pra você testar

1. Abrir **Comida & Poções**: o seletor mostra Comida, Poções, Insumos e Outros, e a Família de
   cada um na ordem do mercado do jogo.
2. Escolher Poções › Cura, taxa da estação 320: a Poção de Cura T4.1 deve cobrar **432** de
   estação por receita no painel da linha.
3. Abrir `/craft`: Consumíveis não aparece mais; buscar "poção" não traz nada.
4. Opcional: uma capa de facção na estação, para conferir a mesma regra fora das poções.
