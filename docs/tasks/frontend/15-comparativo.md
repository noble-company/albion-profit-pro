# 15 — Comparativo de cidades e encantamento

## Objetivo
Visualizar ranking de cidades e custo das rotas para itens encantados.

## Por que
O ranking é a decisão de produto mais valiosa, mas só é confiável se separar resultado válido de
falta de dados e mostrar os elos da rota.

## O que implementar
- `ComparativoCidades` e `RotasEncantamento` sobre `/craft/compare`, incluindo `server` do estado
  global da task 09 no corpo.
- Escolher qual dos quatro cenários ranqueia; exibir lucro, ROI, custo, receita, idade mais velha e
  avisos por cidade. Indisponíveis ficam numa seção separada com motivo.
- Clique carrega a simulação completa da cidade preservando parâmetros.
- Para encantados, comprar pronto, craft direto e base + upgrades mostram breakdown por etapa e
  destacam menor custo válido. Explicar que transporte e cidades distintas de compra/craft/venda
  estão fora do escopo.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Tasks 05 e 14.

## Testes manuais
Comparar duas cidades e um item com pelo menos dois níveis de upgrade.

## Testes automatizados
Ranking pelo cenário escolhido, indisponíveis, navegação, rota barata, elo ausente e breakdown de
cadeia.
