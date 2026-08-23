# 05 — Comparação de cidades e rotas de encantamento

## Objetivo
Implementar `POST /craft/compare` sem N+1 e com rotas encantadas semanticamente corretas.

## Por que
A pergunta central é onde produzir. Para encantamento, o dump descreve cada upgrade a partir do
nível anterior; usar só o recurso do nível final subestima a rota.

## O que implementar
- Corpo igual ao simulate (`server` obrigatório incluído), sem local fixo. Comparar somente
  localizações elegíveis configuradas (inicialmente cidades reais confirmadas), nunca toda linha
  oportunística de `location`.
- Nesta fase, compra, craft e venda acontecem na mesma cidade; transporte/arbitragem fica fora do
  escopo e deve estar explícito na resposta/UI.
- Carregar itens, ordens e receitas em lote; queries não crescem com o número de cidades.
- Para output encantado, devolver custos de aquisição: comprar pronto, craft direto e craft base +
  cadeia completa de upgrades. Se faltar um elo/recurso/preço, rota fica indisponível com motivo,
  não com custo zero.
- Aplicar quantidade, retorno, taxas e slippage de modo consistente com a task 04. Destacar a rota
  de menor custo válida e ranquear cidades por lucro do cenário selecionado.
- Não excluir silenciosamente cidade sem dados: devolvê-la como indisponível, separada do ranking.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Task 04.

## Testes manuais
Comparar duas cidades coletadas e um item `.2` ou `.3`; conferir a soma dos upgrades intermediários.

## Testes automatizados
Ranking, cidade indisponível, três rotas, elo ausente, cadeia multi-nível, slippage e contagem de
queries constante ao aumentar cidades.
