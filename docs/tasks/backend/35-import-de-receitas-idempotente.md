# 35 — Import de receitas idempotente

> Corrige **M4** e **P9** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).

## Objetivo
Fazer `scripts/import_recipes.py` poder rodar mais de uma vez, e de qualquer diretório.

## Por que

**Não é idempotente.** `Recipe.output_item_unique_name` é único, e o script faz `session.add()`
puro. A **segunda execução estoura `IntegrityError` e aborta tudo** — inclusive as receitas que
teriam sido atualizadas. Como o `ITEM DUMP.json` é atualizado a cada patch do jogo, reimportar é
uma operação de rotina, não excepcional.

Hoje o único jeito de reimportar é apagar a tabela na mão. Isso é exatamente o tipo de passo
manual não documentado que quebra num momento ruim.

**Caminho relativo ao CWD.** `ITEM_DUMP_PATH = Path("../ITEM DUMP.json")`
(`scripts/import_recipes.py:8`) resolve a partir do diretório de onde o comando foi executado,
não do arquivo. Funciona rodando de `backend/` e falha de qualquer outro lugar — incluindo de
dentro do container, onde a raiz do projeto não existe.

**`scripts/` sem `__init__.py`** e importando `src.*` (P9): só funciona com `backend/` no
`sys.path`.

## O que implementar

### 1. Caminhos ancorados no arquivo
```python
RAIZ_PROJETO = Path(__file__).resolve().parents[2]   # backend/scripts/x.py -> raiz do repo
ITEM_DUMP_PATH = Path(os.getenv("ITEM_DUMP_PATH", RAIZ_PROJETO / "ITEM DUMP.json"))
ITEMS_JSON_PATH = Path(os.getenv("ITEMS_JSON_PATH", RAIZ_PROJETO / "items.json"))
```
Override por env var resolve o caso do container, onde os arquivos podem estar montados noutro
lugar. Falhar cedo e com mensagem clara se o arquivo não existir — hoje o erro é um
`FileNotFoundError` cru sem dizer onde procurou.

### 2. Upsert em vez de insert
`Recipe` ganha upsert por `output_item_unique_name`; os `RecipeIngredient` daquela receita são
substituídos (delete + insert dos novos), porque a lista de ingredientes pode mudar entre
patches. O `cascade="all, delete-orphan"` já está no relacionamento.

Alternativa mais simples e defensável: `--recriar` que trunca `recipe`/`recipe_ingredient`
dentro de **uma transação** e reimporta. Para uma tabela derivada de arquivo (nada de usuário
mora nela), isso é seguro e muito mais fácil de raciocinar. **Recomendo essa**, com o upsert
como evolução se o tempo de import incomodar.

### 3. Relatório em log estruturado
Trocar os `print` por `structlog` (task 24), mantendo os contadores que já existem (`not_found`,
`skipped_multi_recipe`) como campos, não como texto.

### 4. `scripts/__init__.py`
Criar, e documentar a invocação canônica: `uv run python -m scripts.import_recipes` (a partir
de `backend/`). Vale pro `import_items.py` da task 28 também.

### 5. Reaproveitamento
`import_items.py` (task 28) e este compartilham a leitura/parse dos dois JSONs. Extrair o
carregamento pra `scripts/_dumps.py` em vez de duplicar — o `load_unique_name_to_id` atual já é
metade disso.

## Bibliotecas/dependências
Nenhuma nova.

> **Notas de implementação (2026-08-22):**
> - O "recriar" (`DELETE` de `recipe_ingredient`+`recipe` seguido de reimport, tudo numa
>   transação) é o **único comportamento** de `import_recipes()`, não uma flag `--recriar`
>   opcional — do jeito que a spec descreve a flag, rodar sem ela deixaria a 2ª execução
>   quebrando do mesmo jeito que hoje, o que contradiz o objetivo ("poder rodar mais de uma
>   vez") e o teste manual 2 ("rodar de novo" sem menção a flag nenhuma). Confirmado contra
>   o dump real: 2 execuções seguidas, 5553 receitas nas duas, sem erro.
> - `import_items.py` ganhou o mesmo tratamento de caminho ancorado + `structlog` que a
>   spec pede só pra `import_recipes.py` — tinha o mesmo bug de caminho relativo ao CWD
>   (`Path("../items.json")`), e já ia ser tocado mesmo assim pra extrair `_dumps.py`.
> - `scripts/_dumps.py` acabou compartilhando também o parse cru dos dois JSONs
>   (`load_items_json`/`load_item_dump_items`/`iter_category_entries`), não só
>   `load_unique_name_to_id` — o `_as_list`/iteração por categoria também eram duplicados
>   char-por-char entre os dois scripts.

## Depende de
Tasks 24 (log) e 28 (compartilha o carregamento dos dumps).

## Testes manuais
1. `uv run python -m scripts.import_recipes` → importa (~5553 receitas hoje).
2. Rodar **de novo** → conclui sem erro, contagem estável.
3. Rodar de outro diretório (`cd / && uv run --project ... python -m scripts.import_recipes`) →
   encontra os arquivos.
4. Apontar `ITEM_DUMP_PATH` pra um caminho inexistente → erro claro dizendo qual caminho tentou.

## Testes automatizados
- O teste atual (`tests/recipes/test_import_recipes.py`) já usa fixture pequena com
  monkeypatch dos caminhos — **estender** com: rodar o import 2× e afirmar contagem estável e
  ingredientes não duplicados.
- Caso de receita alterada entre execuções: mudar a fixture entre as duas rodadas e afirmar que
  a receita reflete a versão nova (não a antiga, nem as duas).
- Caminho inexistente levanta erro com o caminho na mensagem.
