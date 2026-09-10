# 20 — Colunas enxutas e painel completo

## Objetivo

A tabela passa a ter **8 colunas**, na ordem em que o jogador decide; o que sai dela vai para o
painel expandido, que fica completo.

## Por que

Pedido do usuário. Hoje a tabela tem até 16 colunas e rola para o lado; o app de referência mostra
o essencial numa tela e deixa o detalhe para quando se abre o item.

## As colunas

| Coluna | Conteúdo | Ordena por |
|---|---|---|
| **Item** | ícone, nome curto, `T4.2`, qualidade | tier (task 19) |
| **Investimento** | custo total | custo total |
| **Venda bruta** | receita antes de imposto e taxa | — |
| **Lucro** | prata em cima, **%** embaixo — uma coluna só | lucro **ou** ROI (dois alvos no cabeçalho) |
| **Venda** | cidade + preço unitário + idade do dado | — |
| **Compra** | um card por ingrediente (1 a 4): preço unitário, quantidade, idade | — |
| **Foco** | pontos de foco da sessão | — |
| **Rendimento** | itens produzidos na sessão | — |

**Venda é coluna nova e necessária.** Com a cidade saindo da linha (task 19), "Venda bruta" ficaria
sem dizer *onde* e *por quanto* se vende. É o card "MARTLOCK · P. VENDA 72" do app de referência.

**A idade entra dentro da célula de preço** ("72 · 52m"), no lugar da coluna "Dado de". A regra da
fase — todo número exibido tem procedência — continua valendo, sem gastar coluna.

**O `%` é o ROI** (`lucro / investimento`), o mesmo que já calculamos.

## O que vai para o painel

Cidade de venda e comparação entre cidades (já existe), custo por item, lucro por kg, lucro por
foco, estratégia de compra/venda, fonte do dado, e o subtotal por ingrediente (hoje colunas
`Investimento 1/2` no refino).

## O que implementar

1. A linha do engine carrega o que as células novas precisam e hoje não carrega — preço unitário
   de venda e a observação dele (idade, fonte), e a idade por ingrediente. **Verificar antes** o
   que `ScannerRow`/`ScannerIngredient` já têm.
2. `buildColumns` com as 8 colunas, **igual para refino e craft**: os cards de Compra absorvem a
   diferença de 2 ingredientes (refino) para 1–4 (craft), e o parâmetro `modo` deixa de existir.
3. Cabeçalho de Lucro com dois alvos de ordenação.
4. Painel com as seções novas.

## Depende de

Task **19**.

## Testes automatizados

- As 8 colunas existem, nesta ordem, nas duas telas.
- A célula de Lucro mostra prata e `%`, e ordenar pelo `%` ordena por ROI.
- A célula de Venda mostra cidade, preço unitário e idade; sem preço, `—` com o motivo.
- Um card de Compra por ingrediente, de 1 a 4, sem cortar a quantidade.
- Cada coluna que saiu aparece no painel.

## Testes manuais

Numa tela de 1440 px com navegação e filtros recolhidos, conferir que as 8 colunas cabem sem
rolagem lateral em `/refino` e em `/craft`; abrir uma linha e achar cada informação que saiu da
tabela. (A primeira versão desta spec prometia 1366 px com os painéis abertos — não cabe; ver o
estado da implementação.)

## Estado da implementação

**Concluída.** `npm run test` **411/411** · `typecheck` limpo · `lint` 0 erros (7 avisos, abaixo
dos 8 de antes). Guards vermelhos primeiro.

### A largura, medida em vez de prometida

A navegação tem 208 px (56 recolhida), os filtros 320 px (56 recolhidos, só o botão), o conteúdo
32 px de margem. As 8 colunas pedem **1.096 px no refino** e **1.264 px no craft com 4
ingredientes**. Numa tela de 1440 px:

| Painéis | Sobra | Refino | Craft com 4 |
|---|---|---|---|
| navegação e filtros abertos | 880 | rola | rola |
| só filtros recolhidos | 1.144 | cabe | rola |
| os dois recolhidos | 1.296 | cabe | cabe |

Por isso o **painel de filtros ganhou botão de recolher**, persistido como o da navegação — a
alavanca real eram os 320 px dele, que não recolhiam. Quando não cabe, a coluna Item continua
fixa na rolagem lateral (task 11.2.1).

### Desvios da spec

- **Sem selo de qualidade no Item.** Não existe controle de qualidade na barra; a tabela inteira
  diria "Normal" em toda linha. O `T4.2` já sai no nome, para recurso e equipamento.
- **Colunas de prata com 7,5rem**, não 6,5: `formatSilver` inclui " silver", e item de craft
  passa de milhão.
- **O cabeçalho aceita vários alvos** (`sortTargets`): "Lucro" e "%" são dois botões na mesma
  coluna, e a coluna anuncia `aria-sort` quando qualquer um deles está ativo.
- **A largura da Compra é `maxIngredientes × 5,25rem`**, calculada do catálogo aberto. As linhas
  são grids independentes com o mesmo `grid-template-columns`; largura por conteúdo desalinharia
  cada linha da de cima.
- **`CardDeCompra.tsx` e as funções de `tela.ts` existem por causa do lint.** Declarar o card
  dentro de `columns.tsx` subiu os avisos de 7 para 8 (`react-refresh/only-export-components`,
  o mesmo da task 19).

### A linha ganhou o que a tabela precisa

`saleUnitPrice`, `saleObservedAt` e `saleSource` na linha, e `observedAt` em cada ingrediente — até
aqui isso só existia no painel (`explainRow`). O `saleUnitPrice` é `Money` e ganhou conversão
explícita no Worker; o tipo mapeado da task 12 recusaria compilar sem ela. Preço digitado chega
com idade nula, e a célula diz **"preço fixo"** em vez de inventar uma.

### Dois testes errados antes de valerem

- **Um guard passava contra o código antigo.** "Cada ingrediente carrega a idade" verificava
  `observedAt !== null`; sem o campo, `undefined !== null` é verdadeiro. Reescrito com `typeof`, e
  verificado vermelho cortando a ligação no engine.
- **Um teste falhava sem defeito no código.** Renderizava duas células no mesmo pai, e os dois
  traços viravam um texto só ("——"). O erro da própria biblioteca confirmou: "the text is broken
  up by multiple elements". Cada célula passou a ter seu elemento, como na tabela.

### Pendente pra você testar

1. Abrir `/refino` e `/craft`: 8 colunas, na ordem Item, Investimento, Venda bruta, Lucro, Venda,
   Compra, Foco, Rendimento.
2. Recolher navegação e filtros e conferir que cabe sem rolar para o lado; recarregar a página e
   conferir que continuam recolhidos.
3. Clicar em **Lucro** e em **%** no mesmo cabeçalho e conferir as duas ordenações.
4. Abrir uma linha e achar, na seção **Resultado**, custo por item, lucro por kg, lucro por foco,
   fonte e idade.
