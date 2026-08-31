# 03 — Contrato e fórmulas de cálculo

## Objetivo
Fixar em documentação o significado de cada valor antes de implementar dinheiro.

## Por que
O plano original misturava cenário escolhido com dois resultados, aplicava metade da setup fee ao
Premium e não especificava arredondamento, slippage nem a cadeia de upgrade.

## O que implementar
- Criar `docs/11-formulas-de-craft.md` e indexá-lo em `docs/README.md`. O número `05` já pertence à
  auditoria das Fases 0 a 2 e não pode ser reutilizado.
- Definir `execucoes = ceil(quantidade_desejada / amount_crafted)`, produzido, sobra, quantidade
  bruta e quantidade efetiva esperada após retorno.
- Usar `Decimal` e registrar arredondamento por componente. Quantidades compráveis inteiras usam
  teto; taxas em silver seguem regra observada no jogo, inicialmente teto por cobrança.
- Taxa de retorno é input do jogador. `usar_foco` só calcula foco consumido; não inventa taxa de
  retorno. Exceções por ingrediente precisam ser explícitas e validadas, não inferidas apenas por
  substring `ARTEFACT`.
- Separar `Recipe.silver_cost`, custo de estação informado e eventual custo de upgrade; não assumir
  que `@silver` equivale à taxa exibida por 100 de nutrição.
- Quatro cenários: comprar insumos agora/buy order × vender agora/listar. Imediato consome níveis do
  livro; ordem usa preço-alvo e aplica setup fee. Venda instantânea paga imposto; sell order paga
  setup + imposto. Default: imposto 4% Premium/8% sem e setup 2,5% independente de Premium, todos
  editáveis e marcados para validação in-game.
- Definir custo total, receita líquida, lucro, lucro/unidade e ROI (`lucro/custo_total`; `null` se
  denominador zero). Distinguir margem sobre receita se algum dia for adicionada.
- Documentar cadeia `.0 → .1 → ... → .N` e lacunas do dump.
- Criar `src/craft/constants.py` apenas para defaults configuráveis/identificadores estáveis, com
  testes que apontem para o documento.

## Bibliotecas/dependências
`decimal` da stdlib.

## Depende de
Nenhuma task da Fase 3; usa docs 02 e 03.

## Testes manuais
Revisão de uma conta escrita de T2_FIBER → T2_CLOTH; fluxo integrado e preços ao vivo ficam para a
Task 19. Imposto 4%/8% e setup 2,5% foram confirmados pelo responsável do produto em 2026-08-23;
retorno e estação são inputs do jogador.

## Testes automatizados
Testes puros de arredondamento/defaults e casos de denominador zero. Não testar uma constante sem
testar também a semântica da fórmula que ela afeta.

## Implementação concluída em 2026-08-23

- Contrato consolidado em `docs/11-formulas-de-craft.md`, incluindo o exemplo controlado
  `T2_FIBER → T2_CLOTH`, arredondamento conservador e apresentação arredondada para baixo em uma
  casa decimal.
- Defaults e identificadores estáveis adicionados em `backend/src/craft/constants.py`.
- Fórmulas puras reutilizáveis adicionadas em `backend/src/craft/formulas.py`, sem dependência de
  banco, mercado ou framework.
- 13 testes unitários cobrem produção em lote, retorno e exceção explícita, foco, defaults,
  arredondamento independente das cobranças, quatro modalidades financeiras e ROI sem
  denominador, além de garantir que `2,525` seja apenas exibido como `2,5` sem perder precisão no
  cálculo interno.
- Após o refinamento de apresentação, os 13 testes da Task 03 e seu Ruff passaram. A suíte
  integrada, já com as mudanças paralelas das Tasks 01 e 02, passou com 258 testes.
