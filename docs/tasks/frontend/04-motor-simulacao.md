# 04 — Motor de simulação

## Objetivo
Implementar `POST /craft/simulate` com cotações executáveis e quatro cenários comparáveis.

## Por que
Melhor preço × lote inteiro ignora slippage. `query_book_depth` informa cobertura total, mas não o
custo de consumir cada nível do livro.

## O que implementar
- Criar `src/craft/{schemas,service,router}.py` e registrar em `main.py`.
- Request: `server` (`AlbionServer`, obrigatório — mesmo enum de `prices/constants.py`), `output_item`
  canônico, quantidade, local, qualidade do produto, `scope`, retorno, estação por execução,
  foco/premium, overrides de imposto/setup e preços manuais por item/lado. `server` é repassado
  integralmente às chamadas de `prices.service` (task de estabilização 03) — sem ele a consulta de
  livro não sabe qual economia ler.
- Ingredientes usam qualidade 1 por default, com override explícito quando aplicável.
- Implementar consulta bulk de fill: ofertas em preço ascendente para compra imediata e requests em
  preço descendente para venda imediata, acumulando quantidade e custo/receita até o lote pedido.
  Reusar a semântica de frescor/cobertura de `prices.service`; não fazer uma query por ingrediente.
- Para ordens, usar preço-alvo explícito ou melhor preço atual como sugestão, marcar que execução
  não é garantida e aplicar setup fee.
- Resposta contém receita/execuções/ingredientes e `cenarios` com as quatro combinações, cada uma
  com breakdown, ROI e avisos estáveis: `dado_velho`, `profundidade_insuficiente`, `sem_preco`,
  `sem_cobertura`, `ordem_nao_garantida`.
- Sem preço nunca vira zero silenciosamente: totais dependentes ficam `null`.
- Item/receita inválidos usam os códigos da task 02.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Tasks 01, 02 e 03.

## Testes manuais
POST de T2_CLOTH e comparação com conta à mão, incluindo um lote que atravesse dois níveis de preço.

## Testes automatizados
Fórmula sem/com retorno; `amount_crafted > 1`; slippage; quatro combinações; setup apenas em ordens;
imposto na venda; profundidade parcial; preço ausente propagando `null`; `scope=mine`; foco;
overrides; 401/404/422. Contar queries e impedir crescimento por ingrediente.

## Implementação concluída em 2026-08-23

- `POST /craft/simulate` foi publicado com JWT, `server` obrigatório, receita canônica e os quatro
  cenários `immediate|buy_order × immediate|sell_order`.
- `prices.service.query_executable_book_levels` agrega todos os níveis solicitados em uma única
  query. Compra imediata consome offers crescentes; venda imediata consome requests decrescentes.
  Cobertura também é resolvida em lote e `scope=mine` libera o livro global somente para
  combinações coletadas pelo próprio usuário.
- Preços manuais usam os lados reais do livro: `offer` para compra imediata/sell order e `request`
  para buy order/venda imediata. Sugestões de ordem e preços manuais são explicitamente não
  garantidos.
- Fill parcial permanece visível na cotação, mas custo, lucro e ROI dependentes ficam `null`.
  Dados velhos, ausência de preço/cobertura e ordem não garantida usam os cinco avisos estáveis da
  spec.
- Qualidade e elegibilidade de retorno são overrides explícitos por ingrediente; nenhum nome de
  item recebe regra especial implícita.
- A conta HTTP controlada de 8 `T2_CLOTH` atravessou offers de 100 e 110 silver: custo dos
  ingredientes 830, custo total 854, receita líquida imediata 1.152 e lucro 298. O cenário com
  ambas as ordens resultou em custo 762, receita líquida 1.196 e lucro 434.
- Foram adicionados 16 testes do endpoint; `tests/craft` tem 29 testes. A suíte completa passou com
  276 testes, e Ruff/lint/formatação passaram globalmente. O teste com 12 ingredientes manteve no
  máximo 5 SELECTs.
- O contrato está disponível em `/openapi.json`; `frontend/src/api/schema.d.ts` foi gerado na
  Task 07 depois da API da Task 05.
