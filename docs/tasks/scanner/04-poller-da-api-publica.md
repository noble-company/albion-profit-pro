# 04 — Poller da API pública (AODP)

> Corrige `X06`. É a task que tira a cobertura de preço das costas do usuário.

## Objetivo

Puxar periodicamente o topo de livro da API pública do Albion Data Project para dentro de
`price_snapshot`, de modo que o produto tenha preço de item que **ninguém abriu no jogo**.

## Por que

Hoje 100% do dado de mercado vem do nosso próprio client. Um `grep` por
`httpx|aiohttp|requests|urllib` em `backend/src` não acha nenhum cliente HTTP de saída — a única
fonte é o push do ingest.

A consequência apareceu no uso real: o usuário abriu o mercado de T5/T6 em Lymhurst e Fort
Sterling e o resto do catálogo continuou sem preço. Um scanner que só enxerga o que o próprio
usuário já olhou não é um scanner.

A API pública resolve a **largura**. Ela não resolve o frescor — e não deve tentar.

### Medições da API (feitas na análise da fase)

`GET https://west.albion-online-data.com/api/v2/stats/prices/{itens}.json?locations={cidades}`

| | |
|---|---|
| Um request | **220 itens × 6 cidades = 1.320 linhas, 416 KB, 1,65 s**, URL com 3.461 de 4.096 chars |
| Cobertura | 935 de 1.320 linhas com preço de venda (**71%**) |
| Frescor | mediana **7 h**, p90 18,7 h, só **38%** abaixo de 6 h |
| Limites | **180 req/min**, 300 req/5 min, URL ≤ 4.096 chars |
| Realms | `west` / `east` / `europe` `.albion-online-data.com` |

Campos por linha: `item_id`, `city`, `quality`, `sell_price_min`, `sell_price_min_date`,
`sell_price_max`, `buy_price_min`, `buy_price_max`, `buy_price_max_date`.

**A mediana de 7 h é a justificativa da regra de precedência da task 03.** Sem ela, este poller
apagaria a cada 10 minutos o preço de minutos atrás que o client acabou de trazer.

## O que implementar

1. **Promover `httpx` a dependência de runtime** — hoje é só `dev` (`pyproject.toml:44`).

2. **`src/prices/aodp.py`** — cliente da API pública, sem Celery e sem banco, para ser testável
   com `httpx.MockTransport`:
   - `build_batches(item_ids)` → lotes que respeitam o teto de 4.096 chars da URL, com margem
     para o `?locations=`. Medido: ~220 IDs cabem.
   - `fetch_prices(client, realm, items, cities)` → linhas cruas.
   - `to_snapshot_rows(raw)` → linhas no formato de `upsert_snapshot`, já com
     `source='aodp'`.

3. **Mapa de cidade explícito.** A API usa nome (`"Fort Sterling"`), nós usamos `location_id`.
   O mapa é uma constante documentada, não uma busca por nome — porque **`Lymhurst` tem dois
   ids na tabela `location` (`1002` e `1301`)** e escolher errado faria as duas fontes gravarem
   linhas diferentes para a mesma cidade, sem nunca se encontrarem.

   Medido no dado real: o client reporta **`1002`** (4.363 ordens); `1301` não aparece nenhuma
   vez. O mapa usa `1002`.

4. **Zero e ausência não são a mesma coisa.** A API devolve `0` para "sem preço". Converter
   para `None` — gravar zero violaria o `ck_price_snapshot_sell_positive` e, pior, mentiria
   dizendo que o item vale nada.

5. **Task Celery `prices.sync_aodp`** — fila `maintenance`, beat a cada 10 min:
   - Itens = união de saídas de receita e ingredientes (o que o scanner precisa cotar).
   - Falha de um lote **não derruba os outros**: a indisponibilidade de um terceiro não pode
     travar a fila nem perder o trabalho já feito.
   - Respeitar o teto de requests; registrar contagem de lotes, linhas e falhas em log
     estruturado.
   - Configurável por env: ligar/desligar e a URL base (para teste e para ambiente sem egress).

6. **Precedência da task 03 faz o resto.** O poller só chama `upsert_snapshot`; quem decide se o
   dado entra é a regra de "mais recente vence, por lado".

## Bibliotecas/dependências

`httpx` promovido de `dev` para runtime. Nada mais.

## Depende de

Task **03** — `price_snapshot` e `upsert_snapshot` precisam existir.

## Testes automatizados

- `build_batches` nunca gera URL acima de 4.096 chars, e cobre todos os itens sem repetir.
- `to_snapshot_rows` converte `sell_price_min: 0` em `None` (**não** em `Decimal("0")`).
- `to_snapshot_rows` usa `sell_price_min_date` e `buy_price_max_date` **separados** — um lado
  velho e outro novo na mesma linha da API chegam com timestamps distintos.
- Cidade desconhecida no mapa é **ignorada com log**, nunca grava `location_id` inventado.
- Com `MockTransport`: um lote que devolve 500 não impede os outros lotes de gravarem.
- **Integração com a precedência**: dado da AODP mais velho não sobrescreve preço do client
  mais novo (o teste da task 03 já cobre; aqui a asserção é ponta a ponta pela task).
- A task é idempotente: rodar duas vezes não duplica linha.

## Testes manuais

```bash
uv run python -c "import asyncio; from src.prices.tasks import _sync_aodp; asyncio.run(_sync_aodp('west'))"
```

```sql
SELECT sell_source, count(*), min(sell_observed_at), max(sell_observed_at)
  FROM price_snapshot GROUP BY 1;
```

Esperado: linhas com `sell_source='aodp'` cobrindo muito mais itens do que os que você abriu no
jogo, e as linhas de `client` intactas onde eram mais recentes.

## Estado da implementação

**Concluída.** `uv run pytest tests/ -q` → **392 passed** (+16) · `ruff` limpo.

- **`httpx` promovido de `dev` para runtime** em `pyproject.toml`.
- **`src/prices/aodp.py`** — cliente puro (sem Celery, sem banco), testável com
  `httpx.MockTransport`: `build_batches`, `fetch_prices`, `to_snapshot_rows`,
  `CITY_TO_LOCATION_ID`.
- **`prices.sync_aodp`** em `src/prices/tasks.py`, fila `maintenance`, beat `crontab(*/10)`.
- **Config**: `AODP_ENABLED`, `AODP_BASE_URL_TEMPLATE`, `AODP_REALMS` (documentadas em
  `.env.example`). Só `west` por padrão — varrer East/Europe gastaria request sem leitor.

### Duas decisões que mereciam ser explícitas

**O mapa de cidade é constante, não busca por nome.** `Lymhurst` tem **dois** `location_id` na
tabela (`1002` e `1301`, migração `f2d7e8f9a0b1`). Medido no dado real: o client reporta
`1002` (4.363 ordens); `1301` nunca aparece. Apontar para `1301` faria as duas fontes gravarem
linhas diferentes para a mesma cidade, que jamais se encontrariam — e o bug seria invisível,
porque as duas linhas existiriam e pareceriam certas.

**Zero da API vira `None`, não `Decimal("0")`.** A API usa `0` para "não tenho preço". Gravar
zero violaria `ck_price_snapshot_sell_positive` e, pior, afirmaria que o item não vale nada —
o oposto de "não sei quanto vale".

**Os itens a cotar saem do catálogo, não de `market_order`.** Puxar só o que já tem preço
reproduziria o `X01` na camada de coleta: item nunca observado continuaria nunca sendo
observado. Tem teste dedicado.

### Execução real contra a API pública

| | |
|---|---|
| Itens do catálogo | **5.844** |
| Lotes | **39** (~150 itens/lote) — folgado sob o teto de 180 req/min |
| Linhas gravadas | **11.335** |
| Lotes com falha | **0** |
| Tempo total | **18,3 s** |

### O que a task entrega, medido

| | Antes | Depois |
|---|---:|---:|
| Itens com preço | **177** | **4.291** |
| Cidades cobertas | 4 | **8** |
| Linhas no snapshot | 281 | **11.404** |

**24× mais cobertura**, e a cobertura deixou de depender de alguém abrir o mercado no jogo.

E a precedência funcionou em produção — os preços que o client trouxe às 00:35 sobreviveram ao
poller intactos:

```
T4_PLANKS_LEVEL4@4   4002  41000  client  2026-09-08 00:35:56
T2_CLOTH             4002     22  client  2026-09-08 00:33:36
```

### Pendente pra você testar

Abrir o mercado de um item no jogo numa cidade e comparar com o que o snapshot tem para o
mesmo combo — e conferir que, depois do próximo ciclo do poller (≤ 10 min), o seu preço
continua lá, não substituído pelo da API.
