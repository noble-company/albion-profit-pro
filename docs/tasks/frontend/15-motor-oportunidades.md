# 15 — Motor agregado de oportunidades

## Objetivo
Criar os rankings que respondem o que vale a pena fazer agora sem exigir busca item a item.

## O que implementar
- Endpoints autenticados `GET /opportunities/flips`, `/opportunities/refining` e
  `/opportunities/crafting`.
- Filtros por `server`, cidades, tier, encantamento, qualidade, lucro/ROI mínimo, frescor e
  quantidade mínima.
- Flip: menor ask na origem contra maior bid no destino, quantidade executável, imposto, setup fee,
  e lucro/ROI líquidos.
- Refino: receita, insumos, retorno, estação, foco/Premium e valor de venda.
- Craft: varredura em lote das receitas elegíveis, sem N chamadas HTTP por item.
- Resposta ordenada, paginada e com preço, idade, cobertura, fonte e warnings por linha.
- Cache curto por realm/filtros e proteção contra combinações sem cobertura.

## Depende de
Tasks 01–05, 09, 12–14.

## Testes automatizados
Arbitragem entre cidades, quantidade limitada pelo menor lado, taxas, stale/null, ranking,
paginação, cache e isolamento de realm.

## Implementação atual (2026-08-23)
- Entregue o endpoint autenticado `GET /opportunities/flips` no backend.
- O ranking cruza ordens de compra e venda entre cidades do mesmo realm, limita a quantidade ao
  menor lado, desconta imposto de venda (4%) e taxa de criação de ordem (2,5%), calcula lucro/ROI,
  pagina e aplica filtros de lucro/ROI mínimo.
- Incluído warning `dado_velho` quando o dado mais antigo da oportunidade ultrapassa seis horas.
- Os endpoints `refining` e `crafting` agora processam receitas em lote dentro do backend, usando
  `simulate_craft` para manter as mesmas fórmulas, taxas, profundidade e warnings da calculadora.
  O ranking limita candidatos a 200 receitas por chamada e permite recorte por cidade, tier,
  encantamento, lucro e ROI.
- O transporte entre cidades não faz parte do cálculo por decisão de produto; o lucro considera
  somente preços, imposto e taxas do mercado.
- O cache atual tem TTL curto de 30 segundos e é best-effort: se o Redis estiver indisponível, a
  API recalcula diretamente no PostgreSQL.
