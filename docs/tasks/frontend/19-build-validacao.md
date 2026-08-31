# 19 — Build e validação final

## Objetivo
Publicar a SPA e validar o produto com dados reais do jogo.

## O que implementar
- Build multi-stage único para frontend/API/worker/migrations.
- Serving da SPA com fallback apenas para HTML e assets com cache correto.
- Base URL de mesma origem em produção e CORS apenas no desenvolvimento.
- Validação real: coleta, Market Flip entre cidades, refino, craft, taxas, retorno, Premium, foco,
  timestamps, warnings e recuperação de indisponibilidade.
- Registrar evidências e atualizar documentação de fórmulas e operação.

## Depende de
Task 18.

## Testes manuais
Executar os três fluxos principais com Albion Online aberto e confirmar os valores contra conta manual.

## Testes automatizados
Build, health/API, fallback HTML, assets, worker, migrations e regressão completa.
