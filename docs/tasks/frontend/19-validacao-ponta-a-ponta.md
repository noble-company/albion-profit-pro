# 19 — Validação ponta a ponta e fechamento

## Objetivo
Validar com o jogo real o fluxo completo e fechar as hipóteses econômicas restantes.

## Por que
Taxas, retorno, custo de estação e leitura de mercado precisam sobreviver ao confronto com a UI do
jogo. Esta task exige um humano com Albion Online aberto.

## O que implementar

Executar e registrar a validação abaixo; corrigir documentação, constantes e testes se o jogo
contradizer alguma hipótese. Não há feature nova prevista nesta task.

### Roteiro de validação
1. Registrar/login pela UI, gerar token e configurar o client sem expor segredo.
2. Trocar de zona, coletar mercado e ver preços/timestamps aparecerem.
3. Conferir offer/request e um lote que atravesse níveis do livro.
4. T2_FIBER → T2_CLOTH: quantidade, retorno, estação, imposto, setup, lucro e arredondamentos contra
   conta manual.
5. Confirmar setup fee em buy/sell order e imposto Premium/sem Premium. Divergência atualiza
   `docs/05-formulas-de-craft.md`, constantes e testes antes de fechar.
6. Validar `Recipe.silver_cost`, fórmula da taxa da estação e exceções de retorno; o que não puder
   ser confirmado permanece marcado como não modelado, nunca assumido.
7. Comparar duas cidades e uma cadeia encantada; confirmar que transporte não entrou na conta.

## Entregáveis
- Evidências e valores observados registrados em `docs/05-formulas-de-craft.md` ou novo doc empírico.
- Itens 3 e 4 de Verificação do plano macro marcados com data.
- Checklist desta fase fechado; `CLAUDE.md` e `AGENTS.md` atualizados para frontend implementado.
- Achados novos roteados conforme `docs/README.md`.

## Bibliotecas/dependências
Nenhuma; verificação humana.

## Depende de
Tasks 01-18.

## Testes manuais
A task inteira.

## Testes automatizados
Regressão global antes do fechamento:

```bash
cd backend && uv run pytest tests/ -v && uv run ruff check .
cd ../frontend && npm run lint && npm run typecheck && npm run test && npm run test:e2e
```
