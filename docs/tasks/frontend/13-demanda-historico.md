# 13 — Demanda e histórico

## Objetivo
Mostrar profundidade, giro e tendência sem alegar conhecer pessoas únicas.

## Por que
O endpoint conhece unidades/ordens e histórico agregado; “quantas pessoas compram” seria uma
interpretação falsa.

## O que implementar
- `DemandaItem` e `GraficoSerie6h` sobre `/items/{unique_name}/demand` somente após `server` (estado
  global da task 09), local e qualidade estarem definidos; incluir encantamento.
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
Query condicional (inclui `server` nas dependências do hook), janelas separadas, série vazia, troca
de filtros, tabela alternativa e labels sem “pessoas”.

## Implementação concluída (2026-08-23)

- `DemandaItem` integrado ao detalhe do item e ao endpoint de demanda.
- Cards separados para livro atual, 24h, 7d e 30d, usando unidades/ordens e volume agregado.
- Gráfico Recharts da série de 6h com tooltip e tabela textual alternativa em horário local.
- Estados condicionais para servidor, cidade, qualidade, série vazia e falha de API.
- Texto explícito evita interpretar unidades/ordens como compradores únicos.
