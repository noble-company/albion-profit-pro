# 29 — Fechamento documental da Fase 3.5

> Corrige `A02`. Mesmo espírito da task 2.5/14.

## Objetivo

Fazer a documentação voltar a descrever a realidade, e fechar a fase com um gate verificável.

## Por que

O projeto trata `docs/` como memória autoritativa, e ela está desatualizada em pontos que
enganam quem chega:

- `README.md` da raiz diz que o projeto está na **Fase 2.5** e que `frontend/` está "ainda não
  criado; próximo passo" — enquanto o frontend tem 5.220 linhas e 17 de 19 tasks concluídas.
- O aviso no topo do README ainda fala em não distribuir o client até fechar gates da 2.5.
- `docs/00-plano-macro.md` diz "Fase 3 em andamento (17/19)" sem mencionar a 3.5.
- `docs/README.md` não lista o documento `12` nem esta fase.
- `docs/tasks/frontend/README.md` marca 18 e 19 abertas sem registrar que a 18 foi absorvida
  pela task 27 desta fase.
- O plano macro promete push de preço em tempo real via WebSocket, que não existe (task 08).

É exatamente o padrão do achado `R14` da revisão anterior: documento e código divergindo em
silêncio, e a fase seguinte partindo de premissa falsa.

## O que implementar

1. Atualizar `README.md` da raiz: estado real por diretório, comandos do frontend, e o critério
   de baseline Git redefinido na task 01.
2. Atualizar `docs/00-plano-macro.md`: registrar a Fase 3.5, as três decisões de arquitetura
   (divisão do cálculo, reconstrução do frontend por cima, antifraude adiada) e corrigir a
   promessa de pub/sub conforme o resultado da task 08.
3. Atualizar `docs/README.md` com o documento `12` e a pasta `tasks/refatoracao/`.
4. Atualizar `docs/tasks/frontend/README.md`: 18 absorvida pela task 27, 19 como gate final, e o
   estado das 20.4-20.11 após a task 28.
5. Registrar em `docs/12-revisao-fase-3.md` o desfecho de cada achado (`A`, `B`, `F`, `S`), como
   as revisões `04` e `05` fazem — incluindo os conscientemente adiados (`S01`) e os que
   permanecem em aberto (`S06`).
6. Consolidar as medições de performance (tasks 02, 03, 15, 17) num único quadro antes/depois.
7. Confirmar que `CLAUDE.md` e `AGENTS.md` refletem as convenções novas: idioma da API (task 07),
   proibição de `number` em dinheiro (task 18), proibição de cor literal (task 12).
8. Gate final: script que verifica, num ambiente limpo, que `pytest`, `ruff`, `lint`,
   `typecheck`, `test` e `playwright` passam, e que `git status --porcelain` não lista fonte
   não rastreada.

## Depende de

Todas as demais tasks da fase.

## Testes automatizados

- O gate roda de ponta a ponta em ambiente limpo e passa.
- Verificação de links quebrados em `docs/`.
- `git status --porcelain` sem arquivo de fonte não rastreado (regressão de `A01`).

## Testes manuais

Um leitor que só tenha o repositório em mãos consegue entender o estado do projeto e subir
tudo seguindo apenas o `README.md`. Este é o critério real de pronto da fase.
