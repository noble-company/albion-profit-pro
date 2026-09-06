# Documentação — Albion Profit Pro

Índice da documentação do projeto. Comece pelo plano macro.

| Documento | Conteúdo |
|---|---|
| [00-plano-macro.md](00-plano-macro.md) | **Plano geral do projeto** — arquitetura, fases (backend, client, recipes, frontend), ordem de implementação recomendada. Ponto de partida pra qualquer decisão de escopo. |
| [01-mapeamento-albiondata-client.md](01-mapeamento-albiondata-client.md) | Como o `albiondata-client` funciona por dentro (captura de pacotes, protocolo Photon, decode, upload), o que ele já coleta, armadilhas operacionais confirmadas ao vivo, e a investigação (em andamento) de captura de eventos de craft/refino em tempo real. |
| [02-dados-de-receita.md](02-dados-de-receita.md) | Formato do `ITEM DUMP.json` (receitas de craft/refino extraídas do `items.xml` do jogo) e como cruzar com `items.json` pra resolver ingredientes/custos na calculadora. |
| [03-contrato-ingest-real.md](03-contrato-ingest-real.md) | **Contrato de ingest medido com o jogo ao vivo** (2026-08-22, ampliado em 2026-08-23) — escala da prata (×10.000), timestamps em tick do .NET, o que `Timescale` realmente significa, formatos de `LocationId`, payloads reais, e (§8b) a semântica de `evCraftItemFinished` medida com entrada controlada. **Tem precedência sobre qualquer suposição anterior.** |
| [capturas/](capturas/) | Logs brutos das sessões de captura em jogo, com o contexto de cada uma (o que foi feito, o que a tela do jogo mostrava). Matéria-prima dos achados do doc 03. |
| [04-revisao-fase-1.md](04-revisao-fase-1.md) | **Revisão completa da Fase 1** — bugs, riscos de segurança, dívida de arquitetura e padronização, cada achado com ID estável (`C1`, `A3`, `M7`, `N2`…) referenciado pelas tasks 23-36. Inclui as decisões de produto tomadas na revisão. |
| [05-revisao-fases-0-a-2.md](05-revisao-fases-0-a-2.md) | **Auditoria das Fases 0 a 2** — bloqueadores de distribuição, realm, integridade, segurança, reprodução e escala (`R01`-`R14`). Origina a Fase 2.5. |
| [06-fontes-de-dados-estaticos.md](06-fontes-de-dados-estaticos.md) | Origem fixada, checksums, obtenção e política de versionamento dos dumps `items.json` e `ITEM DUMP.json`. |
| [07-releases-do-client.md](07-releases-do-client.md) | Canal de releases próprio, updater fail-closed, artefatos, checksums, assinatura manual e incorporação segura do upstream. |
| [08-quarentena-e-falhas-celery.md](08-quarentena-e-falhas-celery.md) | Política de falhas Celery: ACK/retry/redelivery, quarentena durável no PostgreSQL, sanitização e reprocessamento auditado. |
| [09-operacao-celery-e-swarm.md](09-operacao-celery-e-swarm.md) | Filas dedicadas, resultados, time limits, observabilidade, readiness e stack Swarm de referência. |
| [10-gate-final-fase-2-5.md](10-gate-final-fase-2-5.md) | Runbook e evidências automatizadas/humanas do gate que encerra a Fase 2.5. |
| [11-formulas-de-craft.md](11-formulas-de-craft.md) | Contrato numérico da calculadora: produção, retorno, foco, taxas, quatro cenários, resultado financeiro e cadeia de upgrades. |
| [12-revisao-fase-3.md](12-revisao-fase-3.md) | **Auditoria da Fase 3** — frontend, motor de oportunidades e arquitetura de cálculo. Achados com ID estável (`A01`-`A03`, `B01`-`B11`, `F01`-`F12`, `S01`-`S06`) referenciados pelas tasks da Fase 3.5, e as decisões de arquitetura tomadas em 2026-08-30 (divisão do cálculo, reconstrução do frontend, antifraude adiada). |
| [13-linguagem-visual.md](13-linguagem-visual.md) | **Linguagem visual do produto** — densidade e leitura de tabela, hierarquia da informação, vocabulário de estado, sinalização de confiança, iconografia/microcópia e layout do shell. Decidido antes do bloco de reconstrução das telas (tasks 20-24 da Fase 3.5); prova viva em `/estilo` no app. |
| [tasks/backend/](tasks/backend/README.md) | Microetapas do backend. **Fase 1 (01-22) ✅ completa** e **Fase 1.5 (23-36) ✅ completa** (correções e remodelagem derivadas dos documentos 03 e 04). Uma task por arquivo, com objetivo, racional, o que implementar, dependências e testes. Os checklists de status são a fonte de verdade do que está pronto. |
| [tasks/client/](tasks/client/README.md) | Microetapas da **Fase 2 (client Go) ✅ completa** — autenticação/destino de ingest, UX de localização e validação com o jogo real. |
| [tasks/estabilizacao/](tasks/estabilizacao/README.md) | Microetapas da **Fase 2.5 ✅ completa, 14/14** — estabilização transversal concluída. |
| [tasks/frontend/](tasks/frontend/README.md) | Microetapas da **Fase 3 — 17/19** — entrega o scanner de oportunidades Market Flip, Refino e Craft. A task 18 foi absorvida pela Fase 3.5; a 19 é o gate final, executado depois dela. |
| [tasks/refatoracao/](tasks/refatoracao/README.md) | Microetapas da **Fase 3.5 ▶ em andamento, 23/29** — refatoração derivada do documento `12`: corrige os motores de oportunidade, instala o design system que nunca foi instalado e move a camada "e se" para o cliente. |

> A extensão transversal [20 — snapshots e preços atuais](tasks/frontend/20-snapshot-precos-atuais.md)
> adiciona 11 tasks à Fase 3 para garantir que todas as telas usem somente a coleta mais recente.

## Convenção

- Novos documentos entram numerados (`05-...`, `06-...`) na ordem em que os tópicos forem
  surgindo, e devem ser listados aqui.
- Quando um documento contradiz outro, **o mais recente e o mais empírico vencem** — hoje isso
  significa que o `03` manda em qualquer suposição sobre formato de dado feita nas specs
  originais das tasks 10, 11, 15, 17 e 18.
- Achado novo sobre o protocolo do jogo vai pro `03` (se for medido) ou pro `01` (se for sobre o
  funcionamento do client). Achado sobre nosso próprio código vai para a revisão vigente (`04`
  para Fase 1; `05` para Fases 0-2) e vira task.
