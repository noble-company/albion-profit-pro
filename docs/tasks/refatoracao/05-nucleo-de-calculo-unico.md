# 05 — Núcleo de cálculo único

> Corrige `B07` e `B08`.

## Objetivo

Ter uma única fonte de verdade para taxas do jogo, janela de frescor e primitivas de cotação —
e uma fronteira de módulo pública entre quem calcula e quem consome.

## Por que

`src/opportunities/service.py` redeclara `PREMIUM_SALES_TAX`, `NON_PREMIUM_SALES_TAX` e
`SETUP_FEE`, além de um `_charge()` próprio, em vez de usar `craft/constants.py` e
`calculate_percentage_charge`. São dois lugares definindo o imposto do jogo. No dia em que a SBI
mudar a alíquota, um vai ficar para trás — e o produto vai mostrar dois lucros diferentes para a
mesma operação. O mesmo módulo ainda crava `6 * 3600` em vez de usar
`settings.price_freshness_hours`, que já existe e já é respeitado pelo resto do backend.

`compare_service.py` importa quatro símbolos privados de `craft/service.py`
(`QuoteResult`, `_manual_side`, `_ordered_warnings`, `_quote`). Qualquer refatoração de
`service.py` quebra `compare_service.py` sem aviso, porque o acoplamento é invisível.

## O que implementar

1. `opportunities/service.py` passa a importar as constantes de taxa de `craft/constants.py` e
   a usar `calculate_percentage_charge` de `craft/formulas.py`. Remover `_charge()` local e as
   três constantes duplicadas.
2. Substituir `6 * 3600` pela política já existente (`get_market_book_policy().freshness_hours`).
3. Extrair para um módulo público — `craft/quotes.py` — o que hoje é privado e compartilhado:
   `QuoteResult`, `_quote` e suas variantes, `_manual_side`, `_ordered_warnings`,
   `_sorted_fresh_levels`, `_has_stale_side`, `_quote_age_seconds`.
4. `craft/service.py` e `craft/compare_service.py` passam a importar de `craft/quotes.py`.
   Nenhum import de símbolo `_privado` cruzando módulo permanece no backend.
5. Verificar se `opportunities/service.py` pode reutilizar as primitivas de cotação em vez de
   ter sua própria noção de preço (converge com `B06`, task 02).

## Depende de

Task 01. Recomendado fazer antes ou junto da task 02.

## Testes automatizados

- Alterar `DEFAULT_PREMIUM_SALES_TAX_RATE` muda o resultado de flip, refino, craft e simulação
  ao mesmo tempo — teste que hoje falharia, porque o flip tem constante própria.
- Alterar `PRICE_FRESHNESS_HOURS` altera o aviso `dado_velho` também no flip.
- `grep` de import de símbolo iniciado por `_` entre módulos de `src/` não retorna nada
  (verificação automatizada, não inspeção manual).
- A suíte existente de `tests/craft/` continua verde após a extração para `craft/quotes.py`.

## Testes manuais

Nenhum específico. A validação é a suíte de backend inteira permanecer verde.
