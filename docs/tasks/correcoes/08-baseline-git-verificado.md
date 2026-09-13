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
