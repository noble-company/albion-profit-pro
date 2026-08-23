# 14 — Limpeza documental e validação final da Fase 2.5

> Fecha `R14` e é o gate obrigatório antes da Fase 3.

## Objetivo

Eliminar divergências/documentação morta, fazer a última limpeza profissional e provar o pipeline
completo a partir de ambiente vazio e release controlada.

## Por que

Status e contagens divergem entre `AGENTS.md`, `CLAUDE.md`, plano e READMEs; instruções antigas falam
em migration no boot/import sem passo manual. Comentários de produção repetem histórico de tasks,
identificadores misturam idiomas e o README do fork não explica o produto.

## O que implementar

1. Atualizar todas as fontes de verdade para o mesmo status/contagens/arquitetura. Remover frases
   antigas factualmente falsas, preservando decisões históricas apenas onde identificadas como tal.
2. Criar/atualizar README do fork: relação com upstream, patches locais, build, updater/release,
   config, Npcap, realm, troubleshooting e contribuição.
3. Revisar código tocado na fase por redundância, nomes, tamanho de funções, constantes repetidas e
   comentários. Comentário deve explicar **por quê/invariante**, não narrar task/linha histórica;
   histórico fica nos docs.
4. Padronizar novos identificadores de código em inglês conforme convenção do projeto. Não fazer
   rename massivo do legado sem benefício/compatibilidade; registrar dívida remanescente.
5. Remover imports/arquivos/configuração mortos comprovados por busca/testes. Não refatorar áreas
   upstream fora do caminho Profit Pro.
6. Adicionar CI mínima para lint/testes Python, testes Go, race em ambiente compatível, build da
   imagem e validação de migrations/links/docs.
7. Executar gate automatizado em ambiente limpo:
   `migrate → seed → api → workers → beat → RabbitMQ → Postgres/Redis → APIs`.
8. Testar dois realms com fixtures controladas, retry de indisponibilidade, DLQ, `scope=mine`,
   rollup de borda e reinício de processos.
9. Só depois de tudo verde marcar as 14 tasks e a Fase 2.5 como concluídas e declarar a Fase 3 como
   próximo passo.

## Depende de

Tasks 01 a 13.

## Testes automatizados obrigatórios

- `uv run ruff check .`
- `uv run pytest tests/ -v`
- `go test ./...`
- `go vet ./client/` com baseline explícita do warning upstream
- `go test -race` em CI compatível
- migrations do zero e upgrade a partir do schema anterior
- build/inspeção da imagem e job de seed
- verificador de links/checklists/documentação

## Testes integrados adiados para o gate do frontend

1. Instalação por pessoa/pasta limpa seguindo somente README.
2. Boot/config/token/systray no Windows.
3. Captura real do mercado até consulta de preços e demanda no backend.
4. Queda e retorno de backend/worker sem perda silenciosa.
5. Revisão visual dos logs: sem token, stack útil, realm/tópico/correlação presentes.

## Só o humano poderá validar

- UX final, teste dentro do jogo, domínio/Swarm real e autorização de release/push.

## Estado da implementação — 2026-08-23

**Concluída.** Automação, limpeza e gate reproduzível estão verdes.

- README do backend criado e README do fork reescrito com upstream, patches, build, configuração,
  Npcap/libpcap, realm, troubleshooting, releases e contribuição.
- Fontes de status reconciliadas em 14/14; a Task 08 foi fechada após confirmação operacional do
  proprietário.
- Comentários de produção tocados na fase foram limpos para explicar invariantes, não histórico.
  Marcadores `PATCH LOCAL (Albion Profit Pro)` foram preservados por rebaseabilidade.
- `.github/workflows/backend-ci.yml` cobre Ruff, pytest, migrations, imagem, seed e integridade do
  repositório; `client-ci.yml` cobre testes, vet, race, build e formatação.
- `scripts/verify_repository.py` valida estrutura, contagem/checklist e links Markdown locais sem
  dependências externas.
- Gate limpo executado com imagem real: migration, seed idempotente, API, três workers, beat,
  PostgreSQL, Redis e RabbitMQ verdes. Evidências e comandos estão no
  [runbook do gate](../../10-gate-final-fase-2-5.md).

Por decisão do proprietário em 2026-08-23, instalação por outra pessoa/pasta limpa, systray
Windows, tráfego real do jogo, indisponibilidade durante coleta, revisão visual de logs,
domínio/Swarm real e autorização de release/push serão validados com o frontend completo. O
adiamento não reabre a Fase 2.5; esses itens formam um gate integrado futuro.
