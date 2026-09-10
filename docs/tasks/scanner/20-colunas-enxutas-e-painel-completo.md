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

Abrir `/refino` e `/craft` numa tela de 1366 px e conferir que as 8 colunas cabem sem rolagem
lateral; abrir uma linha e achar cada informação que saiu da tabela.

## Estado da implementação

_Não iniciada._
