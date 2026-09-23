# 08 — Baseline Git verificado de verdade

> Corrige `P08`.

## Objetivo

Fazer o guard do `A01` cobrir o cenário que o originou, e estender a verificação de status às
fases que ficaram de fora.

## Por que

A task 3.5/01 nasceu de `A01`: toda a Fase 3 estava fora do Git, **sem estar no `.gitignore`**.
A resposta foi `verify_no_untracked_source` em `scripts/verify_repository.py:123-141`. Mas o
check só olha uma coisa:

```python
for line in result.stdout.splitlines():
    if not line.startswith("??"):
        continue
    path = line[3:].strip().strip('"')
    if Path(path).suffix.lower() in SOURCE_SUFFIXES:
        errors.append(f"arquivo de fonte fora do Git: {path}")
```

Buracos, todos verificáveis:

- **Só linhas `??`.** Arquivo modificado, staged ou deletado passa.
- **Commit não pushado passa.** O `README.md:188` promete "todo o trabalho precisa estar
  publicado"; o check não sabe o que é `origin`.
- **`git status` respeita o `.gitignore`.** Basta alguém acrescentar `frontend/` ao `.gitignore`
  para o check ficar verde — e essa é exatamente a variante que o `A01` descreve como o erro.
- **`SOURCE_SUFFIXES` (`:36`) tem só `.py .ts .tsx .go .md`.** Falta `.css`, onde vivem **todos**
  os tokens de design da `F02` (`frontend/src/index.css`); falta `.yml`, que são os próprios
  workflows do gate; faltam `.mjs`, `.sql`, `.json`, `.sh`, `.toml`.
- **Em CI é no-op.** `actions/checkout@v6` sempre produz árvore limpa, então o job `repository`
  do `backend-ci.yml:126-129` nunca vai reprovar por isso. O check só tem valor rodando local, e
  nada nos documentos avisa disso — `tasks/refatoracao/29-fechamento-documental.md:77` o vende
  como parte do gate de CI.

Há ainda dois buracos vizinhos no mesmo arquivo:

- `verify_phase_status` (`:114`) só cobre as Fases 2.5 e 3.5. A Fase 3 ("18/19") é afirmada em
  `docs/README.md:25` e em três pontos do `00-plano-macro.md` sem nenhuma verificação; quando a
  task 19 fechar, nada obriga esses pontos a mudarem juntos. Esta fase (3.6) também não é
  coberta.
- `CHECKLIST_ITEM` (`:38`) exige travessão em-dash. Uma linha `- [ ] 30 - Nova task` com hífen é
  **ignorada em silêncio**: o total não muda e tudo passa.
- `markdown_anchors` (`:48-59`) não remove blocos de código ao coletar cabeçalhos, então
  comentários `#` dentro de fences ```bash viram âncoras válidas e tornam a checagem
  permissiva demais.

## O que implementar

1. Fazer o check falhar também em fonte modificada, staged e deletada — não só `??`.
2. Verificar que `HEAD` está publicado: comparar com o upstream configurado e falhar se houver
   commit local não pushado.
3. Detectar fonte **ignorada**: comparar o conteúdo dos diretórios de código com o que o Git
   rastreia (`git status --porcelain --ignored` restrito às pastas de fonte), com allowlist
   explícita para `node_modules/`, `dist/`, `.venv/`, caches e os dumps estáticos.
4. Ampliar `SOURCE_SUFFIXES` com `.css`, `.yml`, `.yaml`, `.mjs`, `.cjs`, `.sql`, `.sh`, `.toml`.
5. Registrar em `verify_phase_status` a Fase 3 (`tasks/frontend/README.md`) e esta Fase 3.6
   (`tasks/correcoes/README.md`), com os documentos de status correspondentes.
6. Aceitar hífen e travessão no `CHECKLIST_ITEM`, e **falhar** quando uma linha começada por
   `- [ ]`/`- [x]` não casar o padrão — hoje ela é ignorada.
7. Remover blocos de código antes de coletar âncoras.
8. Documentar, no próprio script e em `29-fechamento-documental.md`, que a verificação de árvore
   limpa é local por natureza; se quiser valor em CI, o job precisa de `fetch-depth: 0` e de
   comparar com o remoto.

## Depende de

Nada. Mas convém entrar **depois** das tasks que criam arquivo novo (esta fase inteira), para
não brigar com o gate durante a execução.

## Testes automatizados

Este script não tem teste hoje. Criar um mínimo, com repositório temporário:

- fonte não rastreada reprova;
- fonte modificada e não commitada reprova;
- fonte adicionada ao `.gitignore` reprova;
- commit não pushado reprova;
- `.css` e `.yml` não rastreados reprovam;
- checklist com hífen no lugar de travessão reprova em vez de ser ignorado;
- âncora que só existe dentro de bloco de código **não** valida um link.

## Testes manuais

Rodar `python scripts/verify_repository.py` com a árvore suja de propósito e confirmar cada
mensagem.

## Estado da implementação

**Concluída** (2026-09-22). `python scripts/test_verify_repository.py` — **15/15 verdes**
(`unittest` puro, repositórios Git temporários de verdade, sem mock). `python
scripts/verify_repository.py` rodado contra a árvore real deste repositório — ver "achados
reais" abaixo.

### Decisão sobre o item 5 (Fase 3 e Fase 3.6)

Como avisado antes de implementar: a fração "Fase 3 — N/19" só existe em `docs/README.md` e
`docs/00-plano-macro.md` hoje (não em `CLAUDE.md`/`AGENTS.md`/`README.md` da raiz, que descrevem
a fase por tabela, sem fração), e a Fase 3.6 não tem fração "N/17" declarada em lugar nenhum
(é descrita qualitativamente, "substituída pela Fase 4"). Implementado assim:
- **Fase 3:** integridade do checklist 01-19 (a extensão `20.x`, recortada fora por posição no
  texto, não por padrão — ela também é numérica pura, então bate no mesmo regex) + fração
  cruzada só entre os dois documentos que já a declaram.
- **Fase 3.6:** só integridade do checklist 01-17 (sequência sem furo, sem linha malformada) —
  sem fração cruzada, porque nenhum documento afirma uma hoje e inventar um número que ninguém
  decidiu seria pior que não checar.

### O que mudou

- **`verify_no_untracked_source`** — duas chamadas de `git status` separadas (uma
  `--untracked-files=all` pra pegar `??`/modificado/staged/deletado arquivo a arquivo; outra só
  `--ignored`, sem `=all`, pra manter os diretórios ignorados colapsados). Descobri rodando que
  combinar as duas flags faz o Git parar de colapsar `backend/.venv/` numa linha só e expandir
  cada um dos milhares de arquivos dentro — a allowlist de diretório nunca teria chance de casar
  contra um arquivo individual, e o script ficava impraticável (44 mil linhas de saída).
- **`verify_head_is_pushed`** (novo) — compara `HEAD` com `@{u}`; sem upstream resolvível
  (checkout de CI, ou repositório local sem `push -u` ainda) se desliga em silêncio, não é erro.
- **`SOURCE_SUFFIXES`** — `.css .yml .yaml .mjs .cjs .sql .sh .toml` (a lista exata do "O que
  implementar"; o "Por que" também cita `.json`, mas decidi não incluir — pegaria
  `package-lock.json` e outros artefatos de build que não deveriam disparar o guard).
- **Allowlist de diretório ignorado** ganhou um recheck escopado: um diretório fora da
  allowlist por nome (ex: uma pasta de log que só existe porque tudo dentro já bate em `*.log`)
  é reexaminado arquivo a arquivo **só dele**, não reprovado de cara por suspeita — achado
  rodando os testes, não estava na spec original.
- **`CHECKLIST_ITEM`** aceita hífen, en-dash e em-dash (mais um prefixo de letra opcional, pra
  reconhecer as extensões `A01`-`A08` do scanner sem contá-las no total de 38). `_verify_
  checklist_markers_parse` (novo) reprova, nomeada, qualquer linha `- [ ]`/`- [x]` que não case
  nenhum dos três.
- **`markdown_anchors`** remove blocos de código antes de coletar cabeçalhos.
- **`scripts/test_verify_repository.py`** (novo) — 15 testes cobrindo os 7 cenários da spec
  mais 2 regressões achadas na própria implementação (ver "Desvios da spec").
- **`docs/tasks/refatoracao/29-fechamento-documental.md`** — nota sobre a natureza local do
  check (item 8).

### Desvios da spec

- **Dois bugs achados rodando os testes contra o repositório real, não previstos na spec:**
  1. `--ignored` combinado com `--untracked-files=all` expande diretórios ignorados em vez de
     colapsar (documentado acima) — corrigido com duas chamadas separadas.
  2. Um diretório ignorado fora da allowlist virava erro **sem olhar o que tinha dentro** —
     `backend/.runtime-logs/`/`backend/logs/`/`frontend/logs/` (só têm `.log`, ignorados por
     outro padrão, nunca fonte) davam falso positivo. Corrigido com o recheck escopado.
- **`config.yaml` do client** — `.yaml` entrou em `SOURCE_SUFFIXES` por este task, e
  `albiondata-client/config.yaml` (segredo local, `ApiToken`) é ignorado por nome. Mesmo papel
  que `.env` tem no backend ("Env/secrets" no `.gitignore` da raiz). Adicionei um allowlist de
  arquivo individual (`IGNORED_FILE_ALLOWLIST`) só pra este caso, documentado no código —
  não é um convite a ignorar fonte por extensão, é uma exceção nomeada de um arquivo específico.

### Achados reais no repositório (não são falha desta task — são o que o guard existe pra achar)

- **`albiondata-client/scripts/run.sh` está no `.gitignore` do client mas parece fonte de
  verdade** — um wrapper de `go run` de 4 linhas, sentado ao lado de `run.command`, `fmt.sh`,
  `validate-fmt.sh` e os `build-*.sh`, todos rastreados. Sem histórico de commit nenhum
  (`git log --all -- scripts/run.sh` vazio) — nunca foi versionado. Pode ser um esquecimento
  (deveria estar tracked, como os irmãos) ou uma decisão antiga sem registro. **Pendente pra
  você decidir**, não corrigi — não sei se há um motivo pra mantê-lo de fora.
- **Uma quantidade grande de trabalho de sessões anteriores está sem commit** (a lista completa
  sai de `python scripts/verify_repository.py`) — é exatamente o "todo o trabalho precisa estar
  publicado" que o `README.md` já promete e que este guard passa a cobrar de verdade. Não é
  problema desta task; é o gate funcionando pela primeira vez.

### Pendente pra você testar

Nada bloqueante. Se quiser conferir na prática: `python scripts/verify_repository.py` já mostra
os dois achados acima; commitando/publicando o trabalho pendente e decidindo sobre o `run.sh`,
o gate fecha verde de verdade.
