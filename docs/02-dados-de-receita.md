# Dados de receita de crafting/refino (`ITEM DUMP.json`)

## O que é

`ITEM DUMP.json` (na raiz do projeto, ~17MB) é o `items.xml` oficial do jogo — mantido publicamente atualizado pela comunidade no repositório `ao-bin-dumps` — convertido de XML pra JSON (atributos XML viram chaves prefixadas com `@`). Baixado manualmente pelo usuário em 2026-08-21.

Isso resolve o bloqueio da **Fase 1b** do [plano macro](00-plano-macro.md): sem esse arquivo não teríamos como saber quais matérias-primas (e em que quantidade) cada item craftado/refinado exige.

## Estrutura geral

Tudo fica dentro de `items.{categoria}`, onde cada categoria é um array (ou objeto único) de itens daquele tipo. As categorias relevantes pra crafting/refino:

| Categoria | Conteúdo |
|---|---|
| `simpleitem` | Recursos crus e refinados (fibra, tecido, minério, barra, madeira, tábua, pedra, bloco, couro) — refino puro, 1 ingrediente (T2-T3) ou 2 (T4+, ver abaixo) |
| `equipmentitem` | Armaduras, capacetes, botas, offhands/escudos |
| `weapon` | Armas |
| `consumableitem` | Poções e comida |
| `mount` | Montarias |
| `furnitureitem` | Móveis de hideout/ilha |

Outras categorias (`hideoutitem`, `trackingitem`, `farmableitem`, `rewardtoken`, `trashitem`, `mountskin`, `journalitem`, `labourercontract`, `transformationweapon`, `crystalleagueitem`, `siegebanner`, `killtrophy`) existem mas não têm relevância direta pra calculadora de crafting/refino.

## Formato de uma receita (`craftingrequirements`)

Todo item craftável tem um bloco `craftingrequirements` com:

| Campo | Significado |
|---|---|
| `@silver` | Taxa em prata cobrada pela estação (na maioria dos refinos básicos é `0`) |
| `@time` | Tempo de craft (unidade relativa, não confirmada em segundos/horas exatos) |
| `@craftingfocus` | Pontos de foco necessários se o jogador optar por usar foco (bônus de retorno de recursos) |
| `@amountcrafted` | Quantas unidades o craft produz por execução (geralmente `1`, mas pode ser mais — ex: poções em lote de 5) |
| `craftresource` | **Objeto único** (1 ingrediente) OU **array** (2+ ingredientes) — cada um com `@uniquename`, `@count` e opcionalmente `@enchantmentlevel` |

### Exemplo — refino simples (1 ingrediente)
```json
// T2_CLOTH
"craftingrequirements": {
  "@silver": "0", "@time": "0.02083", "@craftingfocus": "18", "@amountcrafted": "1",
  "craftresource": { "@uniquename": "T2_FIBER", "@count": "1", "@enchantmentlevel": "0" }
}
```

### Exemplo — refino de tier alto (2 ingredientes: matéria-prima + refinado do tier anterior)
```json
// T3_CLOTH
"craftresource": [
  { "@uniquename": "T3_FIBER", "@count": "2", "@enchantmentlevel": "0" },
  { "@uniquename": "T2_CLOTH", "@count": "1", "@enchantmentlevel": "0" }
]
```
Esse padrão (matéria-prima do tier atual + refinado do tier anterior) é o que resolveu a dúvida que ficou aberta no [mapeamento do client](01-mapeamento-albiondata-client.md) sobre por que alguns eventos de refino capturados traziam 2 itens em vez de 1.

### Exemplo — equipamento (armadura/arma)
```json
// T1_OFF_SHIELD
"craftingrequirements": {
  "@silver": "0", "@time": "0.167", "@craftingfocus": "0",
  "craftresource": { "@uniquename": "T1_WOOD", "@count": "4" }
}
```

### Variação por encantamento (`enchantments`)
Itens com versões encantadas (.1, .2, .3) têm um bloco `enchantments.enchantment[]`, um por nível, cada um com seu próprio `craftingrequirements` (às vezes pedindo um ingrediente extra, tipo "extrato de alquimia" nível correspondente) e um `upgraderequirements.upgraderesource` — o custo de **upgradar** um item já existente pro próximo nível de encantamento (diferente do custo de craftar do zero):
```json
"enchantments": {
  "enchantment": [
    {
      "@enchantmentlevel": "1",
      "craftingrequirements": {
        "@time": "0.1285", "@amountcrafted": "5", "@craftingfocus": "78",
        "craftresource": [
          { "@uniquename": "T2_AGARIC", "@count": "8" },
          { "@uniquename": "T1_ALCHEMY_EXTRACT_LEVEL1", "@count": "5" }
        ]
      },
      "upgraderequirements": {
        "upgraderesource": { "@uniquename": "T1_ALCHEMY_EXTRACT_LEVEL1", "@count": "1" }
      }
    }
  ]
}
```

### Como isso vira `Recipe` (task 19, revisado)

Cada nível de encantamento vira sua própria linha em `recipe`, com `output_item_unique_name = "{base}@{nivel}"` (segue a convenção do próprio jogo — `items.json` já tem `"T4_HEAD_CLOTH_SET1@1"` como `UniqueName` própria, com seu `Index`; não é uma convenção inventada aqui) e `enchantment_level = {nivel}` (0 pra receita base). Os ingredientes (`craftresource`) desse bloco viram `RecipeIngredient` normalmente — pra equipamento/arma são os mesmos ingredientes da base só que com sufixo `_LEVELN`; pra consumível, os mesmos ingredientes da base **mais** um extra (ex: `T1_ALCHEMY_EXTRACT_LEVELN`). Nenhum tratamento especial precisou ser feito pra essa diferença — a mesma função que já lia `craftresource` (objeto único ou array) cobre os dois casos.

`upgraderequirements.upgraderesource` (sempre um objeto único, nunca lista — confirmado nos ~4300 níveis de encantamento do dump real) fica em 3 colunas direto na linha do `Recipe` daquele nível: `upgrade_resource_unique_name`/`upgrade_resource_item_id`/`upgrade_resource_count`. É `NULL` pra `enchantment_level=0` (nada a upgradar pro nível 0) e pra níveis sem essa rota documentada (ex: nível 4 de alguns itens — provavelmente porque upgrade pra top-tier passa por outro sistema, tipo "Avalonian", não coberto pelo dump).

**Caso de uso**: com as duas rotas de custo na mesma linha (craftar já encantado vs. craftar base + upgradar), dá pra calcular "vale mais a pena comprar já encantado no mercado, craftar direto encantado, ou craftar base e upgradar?" — comparando preço de mercado do item encantado × custo dos ingredientes da receita encantada (`RecipeIngredient` daquele nível) × custo de craftar a base + `upgrade_resource_count` × preço de mercado do `upgrade_resource_unique_name`.

## `craftingrequirements` como lista — receitas alternativas (achado real)

Numa minoria dos itens craftáveis (**799 de 3088 receitas base**, ~26%, nas 4 categorias relevantes — e também **2420 de 5684 níveis de encantamento**, mesmo padrão), `craftingrequirements` **não é um objeto único** — é um **array de receitas alternativas**, cada uma com seu próprio `@time`/`@amountcrafted`/`craftresource`. Exemplo: `T1_FISHCHOPS` (petisco de pesca) tem 38 variações, uma por tipo de peixe usável como ingrediente. Também aparece em bastante volume nos níveis de yield de gathering (`T5_WOOD_LEVEL1`..`T8_HIDE_LEVEL4` etc.).

```json
// T1_FISHCHOPS (recorte)
"craftingrequirements": [
  { "@time": "0.01", "@amountcrafted": "1", "craftresource": { "@uniquename": "T1_FISH_FRESHWATER_ALL_COMMON", "@count": "1" } },
  { "@time": "0.02", "@amountcrafted": "2", "craftresource": { "@uniquename": "T2_FISH_FRESHWATER_ALL_COMMON", "@count": "1" } },
  ...
]
```

**Não é modelável no schema atual** — `Recipe.output_item_unique_name` é `UNIQUE` (task 12), então não dá pra ter N receitas pro mesmo item de output (ou pro mesmo `output@nivel`) sem uma modelagem diferente (tabela de variantes, por exemplo). O script de import (`backend/scripts/import_recipes.py`, task 19) **pula** esses itens/níveis e os reporta separadamente no log (`skipped_multi_recipe`, distinto de `not_found` — aqui a receita existe, só não é representável ainda). A verificação é feita por item **e** por nível de encantamento independentemente — se a receita base for lista mas um nível específico de encantamento for um objeto único, esse nível ainda é importado normalmente (e vice-versa). Registrado como pendência abaixo.

## Chave de junção com `items.json` — atenção

`ITEM DUMP.json` **não tem** o ID numérico (`Index`) que `items.json` usa (e que o client Go também usa nos eventos de mercado, ex: `1020` pro T2_FIBER). A única chave em comum é o **nome único em texto**:

- `items.json` → campo `"UniqueName"` (ex: `"T2_FIBER"`)
- `ITEM DUMP.json` → atributo `"@uniquename"` (ex: `"T2_FIBER"`)

**Implicação pro backend**: pra ir de "ID numérico que chega do client" até "receita de craft", é preciso um join em 2 saltos:
```
ID numérico (client/mercado) → items.json (Index → UniqueName) → ITEM DUMP.json (@uniquename → craftresource)
```
Vale a pena o script de import (`backend/scripts/import_recipes.py`) já popular a tabela `Recipe` com o ID numérico resolvido de uma vez (via `items.json`), pra evitar fazer esse join em toda consulta da calculadora.

> ⚠️ **Isso resolveu menos do que parecia — achado da revisão de 2026-08-22.** Guardar o ID
> numérico dentro de `Recipe` só cria a ponte **para itens craftáveis**. Mas os dois tópicos de
> mercado usam identificadores diferentes entre si:
>
> | Origem | Campo | Exemplo |
> |---|---|---|
> | `marketorders.ingest` | `ItemTypeId` (string) | `"T2_FIBER"` |
> | `markethistories.ingest` | `AlbionId` (int) | `1020` |
>
> Como **não existe tabela `item` no banco**, não há como juntar o histórico de um item ao preço
> dele — a não ser que ele por acaso tenha receita. Matéria-prima que não se crafta (boa parte
> do que a calculadora precisa) fica sem ponte nenhuma. O mapa `Index ↔ UniqueName` vive só no
> `items.json`, lido uma única vez pelo import.
>
> Correção planejada: tabela `item` populada do `items.json`, em
> [tasks/backend/28-tabela-item-e-localizacao.md](tasks/backend/28-tabela-item-e-localizacao.md).

## Outros campos úteis por item
- `@tier` — tier do item (1-8)
- `@itemvalue` — valor base de venda pra NPC (referência de preço mínimo)
- `@weight` — peso (relevante se formos calcular custo de transporte/fast travel depois)
- `@shopcategory` / `@shopsubcategory1` / `@shopsubcategory2` — categoria (ex: `crafting` / `refinedresources` / `cloth`) — útil pra filtros na UI da calculadora

## Pendências
- ~~**Criar a tabela `item`**~~ — feito na task 28: `src/items/models.py` + `scripts/import_items.py`,
  **12.062 de 12.071** itens do `items.json` importados (9 pulados por excederem `String(64)` —
  todos tokens cosméticos "UNTRADEABLE" de skin de montaria, nunca aparecem no mercado).
- **Tornar o import reexecutável** — hoje a 2ª execução estoura `IntegrityError` e aborta tudo,
  o que é um problema porque o `ITEM DUMP.json` muda a cada patch do jogo. Ver
  [task 35](tasks/backend/35-import-de-receitas-idempotente.md).
- Decidir onde o arquivo mora no repo (raiz, mover pra `backend/data/`, etc.) — hoje está na raiz do projeto.
- Confirmar unidade exata de `@time` (parece ser um multiplicador relativo, não segundos/horas direto).
- ~~Escrever `backend/scripts/import_recipes.py`~~ — feito na task 19.
- ~~Modelar `enchantments`/`upgraderequirements` (receitas encantadas + custo de upgrade)~~ — feito (revisão da task 12/19, 2026-08-21): `Recipe` ganhou `enchantment_level` + `upgrade_resource_*`, ver seção "Como isso vira Recipe" acima.
- Decidir o que fazer com os ~3200 itens/níveis de "receita múltipla" (`craftingrequirements` como lista, ver seção acima) — hoje ficam de fora da tabela `recipe` inteiramente. Se algum deles for relevante pra calculadora (ex: `T1_FISHCHOPS` se refino de comida entrar no escopo), vai precisar de uma modelagem diferente pra suportar múltiplas receitas pro mesmo item de output.
- A rota de upgrade (`upgrade_resource_*`) não tem um custo em prata documentado no dump (`@silver` nunca aparece em `upgraderequirements` — confirmado nos ~4300 casos reais) — se a estação de upgrade cobrar taxa em prata de verdade no jogo, esse custo não está capturado aqui e precisaria vir de outra fonte.
