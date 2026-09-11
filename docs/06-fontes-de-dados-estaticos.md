# Fontes de dados estáticos

Registro reproduzível dos arquivos locais usados para importar itens e receitas. Esses arquivos são
dados de referência somente leitura e não devem ser editados manualmente.

## Origem fixada

Repositório comunitário: <https://github.com/ao-data/ao-bin-dumps>

Revisão validada em 2026-09-11 (task 4/28):

```text
0be6a5e74f30fc1312118be3d017f3832f027cef
```

| Arquivo local | Arquivo na origem | Tamanho | SHA-256 |
|---|---|---:|---|
| `items.json` | `formatted/items.json` | 24.361.810 bytes | `24F9080FD6C1D69CDB2E494A1B6146BC87913D6CF391A515B250DF938EF791DA` |
| `ITEM DUMP.json` | `items.json` | 17.454.750 bytes | `C031CE7713C617B0E1744992E2FB8EE9531AE69B66B887ACA672616F6DE9A036` |
| `world.json` | `formatted/world.json` | 91.925 bytes | `9AA8B6743301EDCF010F95AC053D4917CD787E79523B7E33490613E5522FC6A2` |

Os três artefatos fixados foram comparados por tamanho e SHA-256 com essa revisão. `world.json`
é materializado pelo seed e não precisa permanecer na raiz do projeto.

A revisão anterior, `5cf2e8e9b7021f98683181fa5b0e3c64575978e4` (validada em 2026-08-23), ficou
para trás porque **o jogo renumera os itens entre patches**: 12.049 dos 12.071 `Index` mudaram, e
o histórico que o client manda por número passou a cair no item errado (achado `W9`, task 4/28).
Manter o dataset na revisão do jogo não é só catálogo novo — é o que faz o histórico do client
apontar para o item certo. A semeadura move junto o histórico da API pública, que foi gravado com
o número da revisão anterior.

## Obtenção

Execute na raiz do projeto:

```powershell
$dumpRevision = '0be6a5e74f30fc1312118be3d017f3832f027cef'
Invoke-WebRequest "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/$dumpRevision/formatted/items.json" -OutFile 'items.json'
Invoke-WebRequest "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/$dumpRevision/items.json" -OutFile 'ITEM DUMP.json'
Invoke-WebRequest "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/$dumpRevision/formatted/world.json" -OutFile 'world.json'
Get-FileHash -Algorithm SHA256 'items.json', 'ITEM DUMP.json', 'world.json'
```

Não use `master` no bootstrap: o conteúdo muda a cada atualização do jogo e deixaria ambientes
criados em datas diferentes com catálogos diferentes.

## Política de versionamento e atualização

O repositório `ao-bin-dumps` publica dados extraídos dos arquivos do Albion Online, mas não contém
uma licença explícita para redistribuição na revisão verificada. Por isso:

1. Os dumps permanecem no `.gitignore` e não entram no baseline do produto.
2. O projeto registra revisão, tamanho e checksum, permitindo reconstruir o ambiente sem copiar os
   arquivos para o Git do produto.
3. Uma atualização deve usar novo commit imutável, executar os imports e testes, registrar novos
   checksums neste documento e ser entregue em commit próprio.
4. Não usar Git LFS antes de definir hospedagem e política jurídica de redistribuição.
5. A inclusão futura dos dumps no produto exige autorização explícita sobre licença e distribuição.

O significado e a junção entre os arquivos estão documentados em
[`02-dados-de-receita.md`](02-dados-de-receita.md).

## Bootstrap reproduzível

O manifesto executável do dataset fica em
[`backend/datasets/albion-static-2026-08-23.json`](../backend/datasets/albion-static-2026-08-23.json).
Ele fixa origem, revisão, tamanho, SHA-256 e contagens esperadas dos três arquivos. Também fixa a
revisão global das transformações (busca, chaves canônicas e ordem de ingredientes) e a curadoria
de mercados confirmados; qualquer alteração nesses contratos produz uma nova identidade de
manifesto e força a reaplicação transacional do seed.

No diretório `backend/`, o seed pode baixar diretamente a revisão fixada:

```bash
uv run python -m scripts.seed_static_data
```

Ou consumir um volume somente leitura que contenha `items.json`, `ITEM DUMP.json` e `world.json`:

```bash
uv run python -m scripts.seed_static_data --dataset-dir /datasets
```

O comando valida os três artefatos e todas as contagens antes de alterar o catálogo. A aplicação
de itens, receitas, cidades curadas e versão ativa ocorre em uma única transação protegida por advisory lock do
PostgreSQL; assim, execuções concorrentes são serializadas e leitores observam o catálogo antigo
ou o novo, nunca uma troca parcial. Se o mesmo manifesto já estiver ativo, o resultado é
`unchanged` e os dados não são reimportados.

Na mesma transação, **antes** de trocar os itens, o seed move o histórico da API pública
(`market_history_entry.source = 'aodp'`) para o `albion_id` que o dataset novo dá a cada nome; o
histórico do client não é tocado, e no bloco que o client já tem ele continua vencendo. Nome que
saiu do dataset perde o histórico da API (task 4/28).

| Resultado esperado (revisão `0be6a5e7`) | Contagem |
|---|---:|
| Entradas de item na fonte | 12.237 |
| Itens importados | 12.228 |
| Itens pulados por nome longo | 9 |
| Receitas importadas | 8.548 |
| Receitas alternativas puladas | 339 |
| Receitas sem item correspondente | 39 |
| Localizações curadas | 9 |

A migração do catálogo usa a extensão PostgreSQL `pg_trgm`. O usuário de migration em produção
precisa ter permissão para executar `CREATE EXTENSION IF NOT EXISTS pg_trgm`; como alternativa, a
equipe de infraestrutura deve precriar a extensão antes de `alembic upgrade head`.

O endpoint `/ready` permanece indisponível enquanto não existir uma versão ativa do dataset. Em
produção, a ordem obrigatória é `migrate → seed → API/worker/beat`; a materialização dos processos
e filas no stack é escopo da task 11 da Fase 2.5.

## Arte dos itens — serviço de render oficial

> Investigado em 2026-09-07, durante a Fase 4. Consumido pela task 4/10 (tabela do scanner).

Não existe dump de imagem, e não precisamos de um. A Sandbox Interactive mantém um serviço de
render público cujo identificador **é exatamente o `Item.unique_name` que já está no banco** —
inclusive com o sufixo de encantamento:

```text
https://render.albiononline.com/v1/item/{unique_name}.png?size=64&quality=3
https://render.albiononline.com/v1/item/T6_FIBER_LEVEL3@3.png?size=64
```

Nenhuma tabela de-para, nenhuma coluna nova, nenhum asset hospedado por nós.

### Parâmetros e custo (medidos)

| Parâmetro | Valores aceitos |
|---|---|
| `size` | **32, 64, 96, 128, 217**. Qualquer outro (16, 256, 512) devolve `502`. |
| `quality` | `1`–`5` — desenha a borda de qualidade do item. |

| `size` | Peso do PNG |
|---:|---:|
| 32 | 2,2 KB |
| **64** | **7,9 KB** ← usar em tabela |
| 128 | 28 KB ← usar em detalhe |
| 217 | 75 KB |

`Cache-Control: no-transform, max-age=86400` (24 h), servido de um edge cache (`Age` observado:
33.430 s). Latência ~0,3–0,5 s quando quente.

### Os dois modos de falha são diferentes — e parecidos

- **`502` = render frio, transitório.** A primeira renderização de uma variante pode levar
  **17–24 s** e falhar; a tentativa seguinte volta `200`. Observado com
  `T4_MAIN_MACE_CRYSTAL@4` e `T6_HEAD_GATHERER_ROCK@3` (502 → 200 no retry).
- **`404` = o item não tem arte.** Itens internos/protótipo que existem no dump e não no jogo —
  ex.: `T8_HEAD_CLOTH_PROTOTYPE`, que dá 404 até sem sufixo de encantamento.

Consequência de design: o mesmo `onError` cobre os dois casos. Não vale distinguir no cliente.

### Decisão de consumo

`<img>` direto do navegador, **sem proxy no backend**:

- `loading="lazy"` — só a linha visível baixa. Numa tabela de 5.523 receitas é a diferença entre
  ~44 MB e ~200 KB.
- `onError` → ícone neutro de fallback (cobre 404 real e 502 frio).
- `size=64` em tabela, `size=128` no detalhe.
- O cache de 24 h do navegador absorve a repetição.

Um proxy nosso (para aquecer cache ou não depender de terceiro no caminho quente) é otimização
deliberadamente adiada — sem sinal de que seja necessário.

### Alternativas locais descartadas

| Fonte | Por que não serve |
|---|---|
| `@uisprite` / `@uispriteoverlay1-2` no `ITEM DUMP.json` (3.503 entradas) | É o **nome do sprite dentro do atlas de assets do client**, não uma imagem. Exigiria extrair os assets do jogo — esforço e licença. |
| `albiondata-client` | Só tem o ícone da própria bandeja (`icon/iconwin.go`, `icon/icondarwin.go`). Nenhuma arte de item. |
| `items.json` | Só localização, `Index` e `UniqueName`. Nenhum campo de imagem. |
