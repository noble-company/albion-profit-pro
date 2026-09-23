# Arquitetura do scanner (Fase 4)

> Estado de 2026-09-12, no fechamento da fase. Plano e checklist em
> [tasks/scanner/](tasks/scanner/README.md); cada decisão abaixo aponta a task que a tomou.

## 1. A divisão: o servidor serve dado, o navegador calcula

Até a Fase 3.5, Refino e Craft liam um ranking pré-calculado (`recipe_ranking`), reconstruído de
10 em 10 minutos só para as combinações que já tinham preço. Receita sem preço não existia
(`X01`), filtro era round-trip (`X04`) e o número chegava com até 10 minutos de atraso (`X03`).

A Fase 4 levou até o fim a decisão nº 1 de [12-revisao-fase-3.md](12-revisao-fase-3.md):

| Lado | Faz | Não faz |
|---|---|---|
| **Servidor** | Guarda e serve **dado**: catálogo estático, topo de livro de cada combo, histórico de vendas, e a análise exata sob pedido | Não esconde linha, não filtra por frescor, não calcula ranking |
| **Navegador** | Junta catálogo × preços e calcula **resposta** para todas as receitas escolhidas: custo, lucro, ROI, lucro por kg e por foco, lista de compras | Não inventa preço: ausência é `—` com o motivo, nunca zero |

Duas contas convivem, e o produto mostra a diferença em vez de esconder:

- **Estimativa (scanner)** — topo de livro, instantânea, sobre o catálogo inteiro.
- **Exato ("Analisar com o livro real")** — `POST /craft/simulate` anda a profundidade do livro,
  com slippage e avisos.

## 2. De onde vem cada dado

```text
Albion Online ──► albiondata-client ──► /marketorders.ingest ────► market_order ──┐
                                   └──► /markethistories.ingest ─► market_history_entry (source=client)
                                                                                  │
Albion Data Project (API pública)                                                 │
   prices.sync_aodp          (*/10 min) ─────────────────────────► price_snapshot ◄┘ (source=client|aodp)
   prices.sync_aodp_history  (5-59/10 min) ──────────────────────► market_history_entry (source=aodp)

market_history_entry ──► market_history_daily   (no upload da série, task 29; completo de hora em hora)
ao-bin-dumps (revisão fixada) ──► seed ──► item, recipe, location (catálogo estático)
```

| Fonte | Dá | Regra de precedência |
|---|---|---|
| **Nosso client** | Frescor e profundidade: o livro inteiro que o jogador abriu, e o histórico do gráfico | No snapshot, **por lado, o `observed_at` mais recente vence** (task 03). No histórico, **o client vence o bloco** (task 23) |
| **API pública (AODP)** | Largura: ~150 itens por lote, 39 lotes a cada 10 min, **24× a cobertura** que o client sozinho dava (task 04) | Nunca apaga um lado mais novo do client; mediana de idade de ~7 h |
| **Dataset estático** | Itens, receitas, peso, valor, categorias, cidades | Revisão imutável com SHA-256 ([06](06-fontes-de-dados-estaticos.md)); o seed move o histórico da API quando o jogo renumera itens (task 28, `W9`) |

## 3. Contratos

Todas as rotas são autenticadas e em inglês (`B09`). Dinheiro viaja como string decimal (`F09`).

### `GET /catalog/recipes?kind=refining|crafting`

O catálogo **inteiro**, sem preço e sem paginação (task 02) — paginar ou filtrar por preço aqui
reintroduziria o `X01`. Receitas com ingredientes (`count`, `enchantment_level`,
`return_eligible`), `upgrade_resource`, e os itens com `weight`, `item_value`, `tier`, categorias.

- `ETag` pela versão do dataset + forma do contrato + `kind`; `Cache-Control: private,
  max-age=300, must-revalidate`, `304` repete os headers.
- O frontend guarda no IndexedDB e pinta com ele (task 07); pede com `cache: 'no-cache'`, para a
  revalidação nunca ficar presa na janela do `max-age` (task 21).

### `GET /prices/snapshot?server=&location_id=&kind=&category=&subcategory=&output_item=`

Topo de livro do realm, **formato colunar** (dicionários de string + arrays paralelos, epoch em
segundos): 23 B/linha virariam ~560 KB a cada 30 s (task 03). Cada lado traz `observed_at` e
`source`; `null` é "sem preço", nunca zero. **Sem filtro de frescor.**

- **Recorte por categoria** (task 22): com `kind` + `category`, só os itens das receitas dela —
  saídas, ingredientes e recurso de upgrade. West inteiro: 20.364 linhas, 187 KB com gzip; uma
  subcategoria, 4 a 15 KB. A regra de categoria (`_na_categoria`) tem espelho em
  `frontend/src/scanner/categorias.ts`:
  - `refining` → a família (`shop_subcategory2`);
  - `crafting` → `shop_category` + `shop_subcategory`;
  - `consumables` → Comida/Poções + família, e `insumos` (`fishsauce`, `farmingproducts`) (task 13).
- Polling de 30 s; a identidade da resposta segue os **preços**, não o `generated_at` — o carimbo
  sozinho travava a tela a cada 30 s (task 12).
- **Recorte por saídas salvas** (A07): `output_item` repetido, normalizado e limitado a 200,
  expande cada saída para ingredientes e recurso de upgrade. Não combina com categoria e não
  publica `ETag`: preço novo não pode ser escondido por um validador parcial.

### `GET /prices/sales?server=&kind=&category=&subcategory=&output_item=`

Unidades vendidas por dia, média dos **últimos 7 dias UTC completos**, por item × mercado ×
qualidade, lida do rollup diário que junta client e API pública (task 23). Item sem histórico
**fica ausente**. O diário da série é recalculado no próprio upload do client (task 29, `W11`); o
frontend busca de novo ao voltar o foco, sem polling.
Com `output_item` repetido, devolve somente as saídas salvas; usa a mesma normalização e conflito
com categoria do snapshot (A07).

### `POST /craft/simulate`

A análise exata de uma receita numa cidade, com o livro completo. O scanner manda o cenário da
barra e as exceções de preço declaradas pelo jogador (`manual_prices`), para as duas contas
responderem a mesma pergunta (tasks 11.5, 20).

## 4. O engine no navegador

`frontend/src/scanner/engine.ts` é o porte do motor Python (`decimal.js`), travado por vetores
dourados gerados do próprio `simulate_craft` (task 06).

| Peça | O que decide | Task |
|---|---|---|
| `computeScanner` | Uma linha por receita × cidade de venda; `bestPerRecipe` reduz a uma por receita | 05, 19 |
| `explainRow` | Extrato, cenários, procedência de cada preço, preço de empate — o **mesmo** `evaluate` da linha, com coletor | 11.4 |
| Worker | O craft (8,4 mil receitas) calcula fora da thread principal; refino e Calculadora não | 12 |
| Seleção | A tela abre vazia; calcula só a categoria, o Top 15, "Todas" ou a busca | 21 |
| Preço de compra | Média das cidades de "Comprar em" (padrão), menor preço, cidade fixa, preço na mão — por barra ou por item | 11.3, 24, 25 |
| Estratégia | Melhor cenário, ou compra/venda imediata ou por ordem, declarada | 11.5 |
| Quantidade | Receitas iniciais; o retorno vira execução a mais, só sobre ingrediente que retorna | 11.6, 26 |
| Estação | Taxa por 100 de nutrição, sobre o valor do item; ingrediente sem valor conta zero | 18, 13 |
| Foco | Painel do Destino: `custo × 0,5^(FCE/10000)` — só refino por enquanto | 17 |
| Volume | Coluna Vende/dia, filtro de mínimo e "Mostrar sem volume de vendas" | 23 |

Filtros de exibição (`applyFilters`, `filtrarPorVolume`) rodam sobre as linhas já calculadas e
**nunca** disparam recálculo; só mudar o cenário recalcula (task 12).

## 5. As telas

| Rota | Tela | O que é |
|---|---|---|
| `/refino` | Refino | 110 receitas, famílias de refino |
| `/craft` | Craft | O catálogo de craft menos o que é de cozinha |
| `/consumiveis` | Comida & Poções | Comida, poções e insumos da cozinha, sobre o catálogo de craft (task 13) |
| `/meus-crafts` | Meus Crafts | Uma linha por registro salvo, com quantidade/qualidade próprias, giro e corte local de frescor (A07) |
| `/calculadora` | Calculadora | Uma receita em todas as cidades, com a mesma barra e o mesmo painel do scanner; "Abrir na Calculadora" leva o cenário de uma linha (task 14) |
| `/painel` | Painel do Destino | Níveis de especialização que baixam o custo de foco (task 17) |

### Favoritos e Meus Crafts

Desde o ajuste A06, Refino, Craft e Comida & Poções podem persistir uma receita em
`POST /me/saved-crafts`. O registro pertence ao usuário e ao realm e usa `output_item` como chave
estável do catálogo; ele já guarda quantidade e qualidade do cenário que estava sendo analisado.
O PostgreSQL continua sendo a fonte de verdade, enquanto o TanStack Query mantém apenas o cache
da sessão. A A07 adiciona a bancada `/meus-crafts`: carrega o catálogo completo de craft e refino,
busca mercado apenas para as saídas salvas,
reaproveita o engine e o extrato do scanner, preserva duplicatas pelo UUID e remove cotação acima
de `max_age` **antes** da conta. A observação vencida continua visível somente como diagnóstico.
Cenários individuais editáveis entram na [A08](tasks/scanner/A08-cenario-individual-por-craft.md).

Shell e densidade em [13-linguagem-visual.md](13-linguagem-visual.md) §1 e §6.

## 6. Limites conhecidos

- **Topo de livro é estimativa.** Uma ordem solitária a preço ótimo faz a linha prometer o que o
  mercado não paga na quantidade pedida — o "Analisar" existe para isso.
- **A API pública é larga e velha**: mediana de ~7 h. A tela mostra idade e fonte; o filtro de
  idade máxima é do jogador.
- **O rollup completo leva ~80 s** sobre ~2,3 milhões de blocos de histórico (tasks 23, 29).
- **Foco do Painel do Destino só no refino.** Craft, culinária e alquimia têm a fórmula, não a
  árvore (task 17, decisão da task 13).
- **Arte dos itens** vem do serviço de render da Sandbox; render frio devolve 502 e cai no ícone
  genérico ([06](06-fontes-de-dados-estaticos.md#arte-dos-itens-serviço-de-render-oficial)).

## 7. Achados da fase

| # | Achado | Corrigido em |
|---|---|---|
| `W1` | Taxa de montagem por ingrediente, arredondada diferente no cliente | task 06 |
| `W2` | Encantamento da saída com duas fontes | task 06 |
| `W3` | Guard textual verde testando nada (byte de backspace na regex) | task 09 |
| `W4` | Virtualização não é testável em jsdom | task 10 |
| `W5` | Taxa da estação não é prata por execução | task 18 |
| `W6` | Retorno aplicado a ingrediente que não retorna | task 26 |
| `W7` | Item com mais de uma receita fora do catálogo | task 27 |
| `W8` | Rollup diário e mensal parou com o histórico grande | correção antes da task 23 |
| `W9` | Histórico do client atribuído ao item errado (renumeração do jogo) | task 28 |
| `W10` | Taxa da estação zero em 153 das 172 poções | task 13 |
| `W11` | Volume por dia chegava até 2 h depois do upload | task 29 |

Descrição completa de cada um em [tasks/scanner/README.md](tasks/scanner/README.md#achados-da-fase).
