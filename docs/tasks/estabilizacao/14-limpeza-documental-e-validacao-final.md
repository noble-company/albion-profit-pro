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
7. Executar gate em ambiente limpo:
   `migrate → seed → api → workers → beat → release client → jogo → RabbitMQ → Postgres/Redis → APIs`.
8. Testar dois realms (real ou um real + sintético controlado), retry de indisponibilidade, DLQ,
   `scope=mine`, rollup de borda e reinício de processos.
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

## Testes manuais obrigatórios

1. Instalação por pessoa/pasta limpa seguindo somente README.
2. Boot/config/token/systray no Windows.
3. Captura real do mercado até consulta de preços e demanda no backend.
4. Queda e retorno de backend/worker sem perda silenciosa.
5. Revisão visual dos logs: sem token, stack útil, realm/tópico/correlação presentes.

## Só o humano pode validar

- UX final, teste dentro do jogo, domínio/Swarm real e autorização de release/push.

