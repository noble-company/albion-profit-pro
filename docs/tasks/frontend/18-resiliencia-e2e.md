# 18 — Resiliência e E2E

## Objetivo
Tratar estados normais do coletor e provar os fluxos principais contra serviços reais.

## O que implementar
- Estados para stale/null, sem cobertura, sem preço, profundidade insuficiente, 429, 503 e receita
  ausente.
- Banner global de indisponibilidade sem mascarar erros locais.
- Error boundary que preserva a navegação e não expõe stack ou segredo.
- Playwright para login, Market Flip, Refino, Craft, detalhe e token.
- Ambiente reprodutível com Compose, migrations, seed, API e workers.

## Depende de
Tasks 15–17.

## Testes automatizados
`npm run test:e2e` em ambiente limpo e em segunda execução consecutiva.
