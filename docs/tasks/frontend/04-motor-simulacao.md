# 04 — Motor de simulação

## Objetivo
Implementar `POST /craft/simulate` com cotações executáveis e quatro cenários comparáveis.

## Por que
Melhor preço × lote inteiro ignora slippage. `query_book_depth` informa cobertura total, mas não o
custo de consumir cada nível do livro.

## O que implementar
- Criar `src/craft/{schemas,service,router}.py` e registrar em `main.py`.
- Request: `output_item` canônico, quantidade, local, qualidade do produto, `scope`, retorno,
  estação por execução, foco/premium, overrides de imposto/setup e preços manuais por item/lado.
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
