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

## Implementação concluída em 2026-08-23

- `POST /craft/compare` foi publicado com JWT e recebe o contrato comum do simulador sem
  `location_id`, acrescido do cenário selecionado (`acquisition_mode` e `sale_mode`). A resposta
  declara `same_city_only=true` e `transport_included=false`.
- A comparação usa somente localizações curadas com `kind=city` e nome definido. Assim, inclui
  cidades confirmadas como Brecilien sem depender de `is_royal_city`, mas nunca promove uma linha
  oportunística do ingest ao ranking.
- Cada cidade devolve as rotas `buy_ready`, `craft_direct` e `base_upgrade`. A última percorre cada
  elo desde `.0`, multiplica o recurso de cada upgrade pela quantidade efetivamente produzida e
  fica indisponível com motivo estável quando receita ou recurso intermediário não existe.
- Cobertura e todos os níveis executáveis do livro são carregados em lote. O orçamento medido é
  fixo em 6 SELECTs (cidades, item, família de receitas, ingredientes, cobertura e livro), inclusive
  no teste com 12 cidades.
- Cotações da Task 04 passaram a expor `observed_at` por nível, `oldest_observed_at` e
  `age_seconds`; override manual e ausência de observação permanecem `null`.
- A cidade escolhe a rota válida de menor custo e o ranking usa o lucro dessa rota. Cidades sem
  nenhuma rota financeiramente completa são preservadas em `unavailable_cities`.
- O cenário controlado com Lymhurst e Brecilien confirmou ranking, três rotas, slippage em dois
  níveis, cadeia `.0 → .1 → .2`, quantidades de upgrade e cidade sem dados separada. A validação
  com duas cidades coletadas do jogo continua no fechamento ponta a ponta da Task 19.
- Foram adicionados 5 testes do comparador e ajustado 1 teste de cotação. A suíte completa passou
  com 281 testes; Ruff/lint e a verificação de formatação passaram globalmente.
