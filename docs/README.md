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
| [tasks/backend/](tasks/backend/README.md) | Microetapas do backend. **Fase 1 (01-22) ✅ completa** e **Fase 1.5 (23-36) ✅ completa** (correções e remodelagem derivadas dos documentos 03 e 04). Uma task por arquivo, com objetivo, racional, o que implementar, dependências e testes. Os checklists de status são a fonte de verdade do que está pronto. |
| [tasks/client/](tasks/client/README.md) | Microetapas da **Fase 2 (client Go) ✅ completa** — autenticação/destino de ingest, UX de localização e validação com o jogo real. |
| [tasks/estabilizacao/](tasks/estabilizacao/README.md) | Microetapas da **Fase 2.5 🔄 1/14** — estabilização transversal obrigatória antes do frontend. |
| [tasks/frontend/](tasks/frontend/README.md) | Microetapas da **Fase 3 ⏸ especificada, bloqueada pela Fase 2.5** — completa a API de craft e entrega a SPA React/Vite em 19 tasks. |

## Convenção

- Novos documentos entram numerados (`05-...`, `06-...`) na ordem em que os tópicos forem
  surgindo, e devem ser listados aqui.
- Quando um documento contradiz outro, **o mais recente e o mais empírico vencem** — hoje isso
  significa que o `03` manda em qualquer suposição sobre formato de dado feita nas specs
  originais das tasks 10, 11, 15, 17 e 18.
- Achado novo sobre o protocolo do jogo vai pro `03` (se for medido) ou pro `01` (se for sobre o
  funcionamento do client). Achado sobre nosso próprio código vai para a revisão vigente (`04`
  para Fase 1; `05` para Fases 0-2) e vira task.
