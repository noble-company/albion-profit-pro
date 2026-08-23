# 13 — Demanda e histórico

## Objetivo
Mostrar profundidade, giro e tendência sem alegar conhecer pessoas únicas.

## Por que
O endpoint conhece unidades/ordens e histórico agregado; “quantas pessoas compram” seria uma
interpretação falsa.

## O que implementar
- `DemandaItem` e `GraficoSerie6h` sobre `/items/{unique_name}/demand` somente após local e qualidade
  estarem definidos; incluir encantamento.
- Cards separados: livro atual, vendido 24 h, 7 d e 30 d. Rótulos deixam claro unidade/volume.
- Gráfico Recharts da série de 6 h, com tooltip acessível, timezone local e tabela textual
  alternativa. Não unir visualmente buckets de 1 h e 6 h como uma série contínua.
- Estados vazio/velho e explicação de que histórico não identifica compradores.

## Bibliotecas/dependências
Recharts via componente chart do shadcn/ui.

## Depende de
Task 12.

## Testes manuais
Trocar cidade/qualidade e comparar tendência com o histórico disponível no jogo.

## Testes automatizados
Query condicional, janelas separadas, série vazia, troca de filtros, tabela alternativa e labels sem
“pessoas”.
