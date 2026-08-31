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

## Estado da implementação

Concluída em 2026-08-31. Sem mudança de contrato de API nem de schema.

**Já feito na task 02** (flip em SQL):

- `opportunities/service.py` deixou de ter `PREMIUM_SALES_TAX` / `NON_PREMIUM_SALES_TAX` /
  `SETUP_FEE` / `_charge` próprios; passou a `6*3600` → `get_market_book_policy().freshness_seconds`.

**Feito nesta task:**

1. **`src/craft/quotes.py`** (novo) — fronteira pública de cotação. Movidos de `craft/service.py`,
   agora sem `_`: `QuoteResult`, `quote` (+ `zero_quote`, `manual_quote`, `empty_quote`,
   `immediate_book_quote`, `order_quote`), `manual_side`, `ordered_warnings`,
   `sorted_fresh_levels`, `has_stale_side`, `quote_age_seconds`, `WARNING_ORDER`.
   `manual_side` passou a receber o dict `manual_prices` em vez do request inteiro — serve
   `CraftSimulationRequest` e `CraftCompareRequest` sem importar os dois schemas.
2. `craft/service.py` e `craft/compare_service.py` importam de `craft/quotes.py`.
   `compare_service.py` ainda importa `InvalidOverrideError` de `craft/service.py` — símbolo
   **público**, dependência visível, sem ciclo.
3. As três consumidoras de taxa (`craft/service.py`, `craft/compare_service.py`,
   `opportunities/service.py`) leem `constants.DEFAULT_*` por **atributo de módulo**
   (`from src.craft import constants`), então trocar a constante propaga sem rebind.
4. **Zero import de símbolo `_privado` cruzando módulo** — verificado por
   `tests/test_module_boundaries.py` (varre a AST de `src/`).
5. Ponto 5 do spec: o flip **não** reusa as primitivas de cotação — virou SQL na task 02
   (`price_model="top_of_book"`). O caminho de refino/craft já delega a `simulate_craft`, que
   usa `craft/quotes.py`. Decisão registrada aqui em vez de forçar a convergência.

**`craft/quotes.py` → `prices/service.py`** (por `ExecutableBookLevel`) não fecha ciclo:
`prices/service.py` não importa `craft`.

### Testes

- `tests/craft/test_quotes.py` (novo, 10) — primitivas na nova fronteira: walk imediato,
  profundidade insuficiente, sugestão de ordem, manual, sem cobertura/preço, lado velho,
  ordenação de avisos, `manual_side`.
- `tests/craft/test_rate_source_of_truth.py` (novo, 2) — trocar
  `DEFAULT_PREMIUM_SALES_TAX_RATE` move lucro de flip + refino + `/craft/simulate` juntos;
  trocar a janela de frescor move `dado_velho` no flip.
- `tests/test_module_boundaries.py` (novo, 1) — sem `_privado` cruzando módulo.
- `tests/conftest.py` — limpeza de teste passou a apagar `opportunities:v2:*` e `livro:*` do
  Redis entre testes (buraco de isolamento que os testes novos de flip expuseram).
- `uv run pytest tests/ -q` → **307 passed**. `uv run ruff check .` → limpo.
- `tests/craft/` (suíte pré-existente) segue verde após a extração.
