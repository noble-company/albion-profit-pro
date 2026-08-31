# 27 — E2E Playwright

> Corrige `A03`. Substitui a task 18 da Fase 3, que nunca começou.

## Objetivo

Ter a validação de ponta a ponta que o projeto já configurou e nunca escreveu, com API,
PostgreSQL, Redis e RabbitMQ reais.

## Por que

`frontend/playwright.config.ts` existe e está configurado: `testDir: './e2e'`, `baseURL`
`http://127.0.0.1:4173`, `webServer` rodando `npm run preview`, projeto chromium, trace na
primeira repetição. **A pasta `e2e/` não existe.** `npm run test:e2e` falha imediatamente.

A task 18 da Fase 3 (`resiliencia-e2e`) segue aberta, e o README da fase estabelece que "teste
unitário do frontend usa MSW; E2E usa API, PostgreSQL, Redis e RabbitMQ reais".

Depois das tasks 21-25, isso deixa de ser desejável e passa a ser necessário: a suíte unitária
usa MSW, e MSW já provou (`F07`) que pode mentir sobre a integração.

## O que implementar

1. Criar `frontend/e2e/` com a estrutura e os fixtures de sessão.
2. Subir a stack real (`backend/docker-compose.yml` + API + worker) para os testes, com dados
   semeados determinísticos — reaproveitar o seed estático já reproduzível
   (`backend/scripts/seed_static_data.py`) e um fixture de mercado a partir dos payloads reais
   em `backend/tests/fixtures/wire/`.
3. Fluxos que precisam estar cobertos:
   - registrar, logar, escolher realm e chegar ao Market Flip;
   - **recarregar a página autenticado e continuar logado** (regressão de `F07` no ambiente
     real, onde o MSW não pode mascarar);
   - filtrar oportunidades, paginar e conferir que a ordenação se mantém entre páginas (`F08`);
   - mudar premium/retorno e confirmar que **nenhuma requisição** sai (`task 23`);
   - abrir o detalhe de uma oportunidade e ver os quatro cenários;
   - criar e revogar um token do client;
   - estados de borda: sem cobertura, backend fora do ar, sessão expirando durante a navegação.
4. Decidir a estratégia de CI: rodar E2E em toda alteração ou apenas no fechamento de fase,
   dado o custo de subir a stack.
5. Registrar o procedimento reproduzível no README da fase, como foi feito na task 2.5/08.

## Depende de

Tasks 21-26.

## Testes automatizados

Esta task **é** a suíte E2E. Critério de pronto: `npx playwright test` verde com a stack real, e
o teste de recarregamento falhando de forma verificável se a correção da task 16 for revertida.

## Testes manuais

Executar a suíte numa máquina limpa, seguindo apenas o README, para confirmar que o procedimento
é reproduzível fora deste ambiente.
