# 28 — Tabela `item` e normalização de localização

> Corrige **N3** e **M6** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md), e fecha o
> vão de junção descrito em [../../02-dados-de-receita.md](../../02-dados-de-receita.md).

## Objetivo
Criar a tabela `item` (ponte entre o `Index` numérico e o `UniqueName` textual) e uma tabela
`location`, e tirar as constantes de domínio de dentro da camada de serviço.

## Por que

### Os dois tópicos usam identificadores diferentes pro mesmo item
| Tópico | Campo | Exemplo |
|---|---|---|
| `marketorders.ingest` | `ItemTypeId` (**string**) | `"T2_FIBER"` |
| `markethistories.ingest` | `AlbionId` (**int**) | `1020` |

Hoje **não existe nenhuma tabela no banco que ligue os dois.** O mapa `Index ↔ UniqueName` vive
só no `items.json`, lido uma única vez pelo script de import de receitas. Consequência prática:
não dá pra juntar o histórico de um item com o preço dele nem com a receita — exceto por
acidente via `recipe.output_item_id`, que só existe pra item craftável. Matéria-prima que não
se crafta (a maior parte do que a calculadora precisa) fica sem ponte.

Isso não estava previsto em nenhuma das 22 tasks da Fase 1.

### `LocationId` não é um código numérico
Medido: **194/194** ordens vieram com `"1000-HellDen"`. A lista hardcoded em
`src/prices/service.py:7` só tem códigos de 4 dígitos — aquele endpoint retornaria **vazio**
pra esse dado. Formatos conhecidos: numérico puro (`"1002"`), numérico com sufixo
(`"1000-HellDen"`), e com `@` (rest/smuggler den, tratado explicitamente no client Go).

Além de `String(16)` ser apertado, a lista fixa carrega um TODO admitindo que os próprios IDs
nunca foram confirmados.

## O que implementar

### 1. `src/items/` (novo domínio)
Seguindo o layout domain-driven do resto (`models.py`, `service.py`, `router.py`, `schemas.py`).

```python
class Item(Base):
    __tablename__ = "item"

    unique_name: Mapped[str] = mapped_column(String(64), primary_key=True)   # "T2_FIBER"
    albion_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True)  # Index
    name_pt: Mapped[str | None] = mapped_column(String(255))
    name_en: Mapped[str | None] = mapped_column(String(255))
    tier: Mapped[int | None]
    enchantment_level: Mapped[int] = mapped_column(default=0)
    shop_category: Mapped[str | None] = mapped_column(String(64))
    shop_subcategory: Mapped[str | None] = mapped_column(String(64))
```

`unique_name` como PK (é a chave estável e legível); `albion_id` único e indexado, nullable
porque nem todo `UniqueName` do dump tem `Index` correspondente (o import de receitas já
registra esses casos).

**Script de import** `backend/scripts/import_items.py`, populando de `items.json` (+ `tier` e
categorias vindas do `ITEM DUMP.json`, que já são lidos pelo import de receitas). Idempotente,
com `ON CONFLICT DO UPDATE` — mesmas exigências da task 35.

### 2. `location`
```python
class Location(Base):
    __tablename__ = "location"

    location_id: Mapped[str] = mapped_column(String(64), primary_key=True)  # "1002", "1000-HellDen"
    name: Mapped[str | None] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(32))   # "city" | "hell_den" | "rest" | "desconhecido"
    is_royal_city: Mapped[bool] = mapped_column(default=False)
```

**Preenchimento oportunista**: em vez de manter uma lista curada que vai ficar velha, o ingest
faz upsert da `location_id` que aparecer, com `kind` inferido do formato
(`"-HellDen"` → `hell_den`, `"@"` → `rest`, só dígitos → `city`). Uma lista curada de cidades
reais pode ser sobreposta depois, sem bloquear a coleta.

> Essa é a diferença que importa: a lista fixa **descarta** o que não conhece; o upsert
> oportunista **registra** e deixa a gente classificar depois com dado real na mão.

### 3. Alargar as colunas
`location_id` vira `String(64)` em `market_order` e `market_history_entry` (hoje `String(16)`).
Sem FK obrigatória pro ingest não falhar em localização nova — a FK pode entrar depois que o
preenchimento oportunista estiver rodando.

### 4. Tirar as constantes do serviço
`LOCATIONS` e `range(1, 6)` saem de `src/prices/service.py`. Qualidade vira uma constante
nomeada em `src/items/constants.py` (`QUALIDADES = range(1, 6)`, com comentário do que cada
nível significa no jogo); localização passa a vir da tabela.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Tasks 25, 26 e 27 (as colunas mudam junto). A task 29 depende desta.

## Testes manuais
1. Rodar `uv run python -m scripts.import_items` (de dentro de `backend/` — task 35 corrigiu
   a forma de invocação e os caminhos hardcoded) → conferir contagem e
   `SELECT * FROM item WHERE albion_id = 1020` → `T2_FIBER`.
2. Rodar de novo → contagem estável (idempotente).
3. Enviar as fixtures reais → `SELECT * FROM location` deve conter `1000-HellDen` com
   `kind='hell_den'`, criada automaticamente.
4. Cruzar as duas pontas: dado o `AlbionId` 1020 do histórico, chegar no `ItemTypeId`
   `"T2_FIBER"` das ordens com um `JOIN` só.

## Testes automatizados
- `tests/items/test_import_items.py`: fixture pequena de `items.json`, afirma mapeamento
  `Index ↔ UniqueName` e idempotência em 2 execuções.
- `tests/items/test_location_inference.py`: `"1002"` → `city`, `"1000-HellDen"` → `hell_den`,
  `"3005@1"` → `rest`, valor desconhecido → `desconhecido` (e **não** levanta exceção).
- Teste de junção: gravar histórico (`albion_id=1020`) e ordem (`item_id="T2_FIBER"`), afirmar
  que a query de junção via `item` devolve os dois.
