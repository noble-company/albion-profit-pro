# 17 — Suíte E2E com Playwright

## Objetivo
Provar fluxos críticos contra a API e datastores reais.

## Por que
MSW valida componentes, não integração. A Fase 1 mostrou que mocks verdes não provam o pipeline.

## O que implementar
- Playwright config e specs de auth, token e calculadora.
- Orquestrador reprodutível sobe Compose, aplica migrations, importa itens/receitas, inicia API e
  worker, aguarda `/ready` e encerra processos mesmo em falha.
- Seed passa pelo endpoint de ingest usando payloads derivados das fixtures reais, mas gera IDs,
  expiração e timestamps atuais. Aguardar processamento por polling observável, sem sleeps fixos.
- Isolar execução por usuário/item/IDs e limpar por ciclo descartável do ambiente, não DELETEs
  concorrentes em banco compartilhado.
- Fluxos: registrar/login; criar/copiar/revogar token; buscar item/simular e conferir valor fixo com
  slippage conhecido.
- Capturar trace/screenshot/video apenas em falha no CI.

## Bibliotecas/dependências
`@playwright/test`; containers e serviços existentes do backend.

## Depende de
Task 16.

## Testes manuais
Rodar headed e observar os três fluxos uma vez.

## Testes automatizados
`npm run test:e2e` headless verde em ambiente limpo e numa segunda execução consecutiva.
