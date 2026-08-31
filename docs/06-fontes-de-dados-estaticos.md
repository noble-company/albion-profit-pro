# Fontes de dados estáticos

Registro reproduzível dos arquivos locais usados para importar itens e receitas. Esses arquivos são
dados de referência somente leitura e não devem ser editados manualmente.

## Origem fixada

Repositório comunitário: <https://github.com/ao-data/ao-bin-dumps>

Revisão validada em 2026-08-23:

```text
5cf2e8e9b7021f98683181fa5b0e3c64575978e4
```

| Arquivo local | Arquivo na origem | Tamanho | SHA-256 |
|---|---|---:|---|
| `items.json` | `formatted/items.json` | 23.954.341 bytes | `226A22BE333C949F47021130EADCE697F921BF55AD3CF740E86E254B0D89163F` |
| `ITEM DUMP.json` | `items.json` | 17.219.057 bytes | `FC009A9FB60FB9219C9E44391A842FA6032B5A1D218D1B53E0FFDAA28F29C077` |
| `world.json` | `formatted/world.json` | 91.492 bytes | `30F1D41B9A5215A1A706023BFB25E20A0E69705D98E4F58A67B8CC0DAE5525B9` |

Os três artefatos fixados foram comparados por tamanho e SHA-256 com essa revisão. `world.json`
é materializado pelo seed e não precisa permanecer na raiz do projeto.

## Obtenção

Execute na raiz do projeto:

```powershell
$dumpRevision = '5cf2e8e9b7021f98683181fa5b0e3c64575978e4'
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

| Resultado esperado | Contagem |
|---|---:|
| Entradas de item na fonte | 12.071 |
| Itens importados | 12.062 |
| Itens pulados por nome longo | 9 |
| Receitas importadas | 5.633 |
| Receitas alternativas puladas | 3.139 |
| Receitas sem item correspondente | 39 |
| Localizações curadas | 2 |

A migração do catálogo usa a extensão PostgreSQL `pg_trgm`. O usuário de migration em produção
precisa ter permissão para executar `CREATE EXTENSION IF NOT EXISTS pg_trgm`; como alternativa, a
equipe de infraestrutura deve precriar a extensão antes de `alembic upgrade head`.

O endpoint `/ready` permanece indisponível enquanto não existir uma versão ativa do dataset. Em
produção, a ordem obrigatória é `migrate → seed → API/worker/beat`; a materialização dos processos
e filas no stack é escopo da task 11 da Fase 2.5.
