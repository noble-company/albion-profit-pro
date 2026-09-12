# 16 — Documentos reconciliados

> Absorve a task 3.6/16 ([`correcoes/16`](../correcoes/16-documentos-reconciliados.md)).

## Objetivo

Os documentos de status e de arquitetura passam a descrever o produto que existe: a Fase 4 como
scanner, a 3.6 como substituída, a janela embutida no client como Fase 5. E o gate passa a
conferir o status da Fase 4, para o desencontro não voltar em silêncio.

## Por que

Conferido nos arquivos, 2026-09-12:

| Documento | O que dizia | O que é |
|---|---|---|
| `CLAUDE.md`, `AGENTS.md` | "Current phase is 3.6, 0/17"; backend 350 testes; frontend 200 testes | Fase 4 com 37/38; **462** testes no backend; **565** no frontend (77 arquivos) |
| `README.md` | "O projeto está na Fase 3.6"; prioridade nas tasks 01-04 da 3.6 | A 3.6 foi substituída em 2026-09-07; o fluxo de dados ganhou a API pública e o engine no navegador |
| `docs/00-plano-macro.md` | "Fase 4 — não começou"; a Fase 4 era a UI embutida no client | Fase 4 é o scanner; a UI embutida vira Fase 5 |
| `docs/README.md` | Sem o doc 15, sem `tasks/scanner/`; a 3.6 como fase vigente | — |
| `docs/13-linguagem-visual.md` §6 | Navegação **e** filtros na coluna esquerda (`w-72`) | Desde a 11.1: navegação à esquerda, filtros à direita, as duas recolhíveis; Tamanho do conteúdo (2026-09-12) |
| `docs/tasks/correcoes/README.md` | Nenhum aviso de substituição | — |

E o gate falhava por dois motivos de documento: `tasks/scanner/README.md` apontava para
`15-arquitetura-do-scanner.md`, que nunca foi escrito; e a âncora `#arte-dos-itens--serviço-…` do
`06` — o título tem travessão, o GitHub gera dois hífens, `verify_repository.py` gera um.

**Por que o desencontro passou:** o gate só conferia o status das Fases 2.5 e 3.5 entre os
documentos. A Fase 4 inteira aconteceu sem nenhum documento de status ser obrigado a acompanhar.

## Decisões com o usuário (2026-09-12)

| # | Decisão |
|---|---|
| 1 | **O gate confere a Fase 4.** Conta o checklist de `tasks/scanner/README.md` (que tem tasks `11.2.3` e não é sequencial) e exige o mesmo `N/total` nos documentos de status. |
| 2 | **Depois da Fase 4:** as tasks da 3.6 que seguem valendo — **13 (deploy do frontend) e 14 (systray) primeiro**, porque o gate 19 depende das duas; depois 05, 06, 08, 09, 10, 15 e 17; então o gate 19. Elas ficam em `tasks/correcoes/`. |

## O que implementar

1. **`docs/15-arquitetura-do-scanner.md`** — a divisão servidor/cliente, o fluxo de dados (client,
   API pública, histórico, dataset), os contratos de `/catalog/recipes`, `/prices/snapshot`,
   `/prices/sales` e `/craft/simulate`, o engine no navegador, as telas, os limites conhecidos e o
   índice dos achados `W1`-`W11`.
2. **Status reconciliado** em `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/README.md` e
   `docs/00-plano-macro.md` (seção da Fase 4, Fase 5, ordem de implementação).
3. **`13-linguagem-visual.md` §6** com o shell vigente.
4. **`tasks/correcoes/README.md`** com o aviso de substituição e o que segue valendo.
5. **Âncora do `06`**: o título sem travessão, para GitHub e gate gerarem a mesma âncora.
6. **`scripts/verify_repository.py`** conferindo o status da Fase 4.

## Depende de

Todas as outras tasks da fase (é o fechamento).

## Testes automatizados

- `python scripts/verify_repository.py` verde.
- A checagem nova da Fase 4 nasce vermelha: rodada antes de reconciliar os documentos, acusa o
  status ausente em cada documento de status.

## Testes manuais

Ler `docs/15-arquitetura-do-scanner.md` e o topo do `README.md` e conferir que descrevem o produto
que está na tela.

## Estado da implementação

**Concluída (2026-09-12). Fecha a Fase 4: 38/38.** `python scripts/verify_repository.py` verde.

### A checagem nova nasceu vermelha

Com `verify_scanner_status` no gate e os documentos ainda sem reconciliar:

```text
- README.md: status da Fase 4 ausente
- AGENTS.md: status da Fase 4 ausente
- CLAUDE.md: status da Fase 4 ausente
- docs\README.md: status da Fase 4 ausente
- docs\00-plano-macro.md: status da Fase 4 ausente
```

Os dois defeitos de documento antigos já tinham saído nessa rodada: o doc 15 passou a existir e a
âncora do `06` passou a bater.

### O que mudou

| Arquivo | Mudança |
|---|---|
| `docs/15-arquitetura-do-scanner.md` | Novo — divisão servidor/cliente, fluxo de dados, contratos, engine, telas, limites, achados `W1`-`W11` |
| `CLAUDE.md`, `AGENTS.md` | Estado por pasta (462 testes no backend, 565 no frontend), fase atual → próximo passo, decisão de arquitetura do scanner, gate da Fase 4 |
| `README.md` | Aviso do topo, diagrama com a API pública e o navegador, tabela, status e prioridade |
| `docs/README.md` | Linhas do doc 15 e de `tasks/scanner/`; a 3.6 como substituída |
| `docs/00-plano-macro.md` | Status da 3.6 e da Fase 4, seção nova da Fase 4, UI embutida renumerada para **Fase 5**, ordem de implementação; caminho real do systray (`albiondata-client/systray/`) |
| `docs/13-linguagem-visual.md` §6 | Três colunas: navegação à esquerda, conteúdo, filtros à direita; Tamanho só no centro; filtros ausentes em telas estreitas registrados como dívida |
| `docs/tasks/correcoes/README.md` | Aviso de substituição e o que segue valendo |
| `docs/06-fontes-de-dados-estaticos.md` | Título "Arte dos itens" sem travessão |
| `scripts/verify_repository.py` | `verify_scanner_status`: conta o checklist da Fase 4 (subníveis e ordem livre) e exige o mesmo `N/total` nos documentos de status |

### Decisões que só apareceram fazendo

- **A âncora foi corrigida no título, não no gate.** O `github_anchor` do script colapsa hífens
  repetidos e o GitHub não; trocar a regex mudaria a âncora de outros títulos que hoje funcionam.
  Sem o travessão, os dois geram a mesma âncora.
- **`docs/14-revisao-fase-3-5.md` ficou como registro.** É a auditoria da 3.5 como foi feita; o
  destino de cada achado mora na herança da 3.6, e o `docs/README.md` aponta para lá.
- **A coluna de filtros não existe abaixo de `md`.** Encontrado ao reescrever a §6: o `Sheet` do
  mobile leva só a navegação. Registrado como dívida, não corrigido aqui — é código, e o produto
  é usado no desktop ao lado do jogo.

### Pendente pra você conferir

Ler o topo do `README.md` e o `docs/15-arquitetura-do-scanner.md` e confirmar que descrevem o
produto que você usa.
