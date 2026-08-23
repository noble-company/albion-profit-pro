# Tasks — Fase 2.5: estabilização e prontidão para escalar

Derivada da [revisão das Fases 0 a 2](../../05-revisao-fases-0-a-2.md). É uma fase transversal:
há trabalho no repositório, client Go, backend, dados e operação.

**Objetivo:** remover bloqueadores de correção, distribuição e reprodução antes de iniciar o
frontend. A fase termina quando o repositório e o pipeline reproduzível passam pelo gate
automatizado da task 14. O ensaio integrado com cliente Windows, jogo e Swarm será executado com o
frontend completo, quando toda a jornada puder ser validada de ponta a ponta.

## Ordem e dependências

```text
01 Baseline Git + README
 ├─ 02 Updater e releases do client
 └─ 03 Realm ponta a ponta ───────────────────────────────┐

04 Corrigir rollup diário ────────────────────────────────┤
05 Isolar fonte no scope=mine ────────────────────────────┤
06 Falhas Celery + DLQ ──┬─ 07 Validar contrato de ingest│
                         └─ 11 Filas e operação Celery ───┤
08 Proteger rate limit ────────────────────────────────────┤
09 Uploader resiliente + concorrência ── depende de 02/03 ┤
10 Seed reproduzível ── depende de 03 ────────────────────┤
12 Semântica/escala do livro ── depende de 03/05 ─────────┤
13 Validação no boot + config de produção ── 02/03/09 ────┤
14 Limpeza documental + validação E2E ── depende de todas ┘
```

Tasks 04, 05, 06 e 08 podem avançar em paralelo depois da 01. Implementar **uma por vez** com a
skill `/implementar-task`; cada spec deve ser validada contra o estado real e receber confirmação
explícita antes de alterar código.

## Lista

| # | Task | Corrige | Entrega principal |
|---|---|---|---|
| [01](01-baseline-git-e-readme.md) | Baseline Git e README raiz | `R03` | Histórico rastreável e onboarding canônico |
| [02](02-updater-e-releases-do-client.md) | Updater e releases próprias | `R01` | Binário nunca instala release upstream |
| [03](03-realm-ponta-a-ponta.md) | Realm ponta a ponta | `R02` | West/East/Europe isolados em wire, banco, cache e API |
| [04](04-integridade-do-rollup-diario.md) | Integridade do rollup diário | `R04` | Dias completos, idempotentes e auto-corrigíveis |
| [05](05-isolamento-da-fonte-no-scope-mine.md) | Fonte no `scope=mine` | `R05` | Livro e histórico não concedem cobertura cruzada |
| [06](06-falhas-celery-e-dlq.md) | Falhas Celery e DLQ | `R06` | Erro permanente observável/reprocessável |
| [07](07-validacao-do-contrato-de-ingest.md) | Validação do ingest | `R07` | Domínio inválido rejeitado antes do broker |
| [08](08-seguranca-do-rate-limit.md) | Segurança do rate limit | `R08`/`F7` | Sem token cru e sem spoofing trivial de IP |
| [09](09-uploader-resiliente-e-concorrencia.md) | Uploader resiliente | `R09` | Fila limitada, transporte reutilizado, retry e estado seguro |
| [10](10-seed-de-dados-reproduzivel.md) | Seed reproduzível | `R10` | Ambiente novo recebe itens/receitas com versão e checksum |
| [11](11-filas-e-operacao-celery.md) | Filas e operação Celery | `R11` | Ingest isolado de manutenção e deploy completo |
| [12](12-semantica-e-escala-do-livro.md) | Semântica/escala do livro | `R12` | API explicita cobertura/frescor e consulta só combinações úteis |
| [13](13-validacao-no-boot-e-config-producao.md) | Boot/config de produção | `R13` | Token/destino validados antes da captura |
| [14](14-limpeza-documental-e-validacao-final.md) | Fechamento da fase | `R14` | Docs coerentes + teste completo em ambiente limpo |

## Status

- [x] 01 — Baseline Git e README raiz
- [x] 02 — Updater e releases do client
- [x] 03 — Realm ponta a ponta
- [x] 04 — Integridade do rollup diário
- [x] 05 — Isolamento da fonte no `scope=mine`
- [x] 06 — Falhas Celery e DLQ
- [x] 07 — Validação do contrato de ingest
- [x] 08 — Segurança do rate limit
- [x] 09 — Uploader resiliente e concorrência
- [x] 10 — Seed de dados reproduzível
- [x] 11 — Filas e operação Celery
- [x] 12 — Semântica e escala do livro
- [x] 13 — Validação no boot e configuração de produção
- [x] 14 — Limpeza documental e validação final

## Gate de saída

- Repositório com baseline, remote documentado e estratégia de contribuição com upstream.
- Release do client controlada pelo Profit Pro; updater upstream impossível.
- Realm obrigatório e testado em toda chave de identidade/cache/API.
- Nenhum erro inesperado de worker recebe sucesso silencioso.
- Imagem + jobs de deploy conseguem migrar e semear banco vazio.
- Ingest não compete com rollup/poda e não persiste resultados inúteis.
- Testes Python/Go, migrations, imagem Docker e ambiente limpo verdes.
- `AGENTS.md`, `CLAUDE.md`, plano macro, READMEs e checklists concordam.

Os testes integrados no cliente Windows, Albion Online e Swarm real foram transferidos, por decisão
do proprietário em 2026-08-23, para o gate posterior à implementação completa do frontend.
