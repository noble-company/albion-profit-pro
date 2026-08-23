# Albion Profit Pro

Plataforma própria para calcular lucro de crafting e refino no Albion Online a partir de preços
coletados pelo jogador no mercado do jogo.

> [!WARNING]
> O projeto está na Fase 2.5 de estabilização. Backend e coleta funcionam ponta a ponta, mas o
> client ainda não deve ser distribuído amplamente até concluir updater próprio, isolamento por
> realm, retry e controle de concorrência.

## Arquitetura

```text
Albion Online
    │ tráfego local do mercado
    ▼
albiondata-client (Go + Npcap)
    │ POST autenticado
    ▼
FastAPI ──► RabbitMQ ──► Celery worker ──► PostgreSQL
                                            │
                                            └──► Redis (cache descartável)
```

| Diretório | Responsabilidade | Estado |
|---|---|---|
| `albiondata-client/` | Captura preços do tráfego local e envia ao backend | Fase 2 concluída; estabilização pendente |
| `backend/` | Auth, ingest, preços, receitas, filas e persistência | Fases 1 e 1.5 concluídas; estabilização pendente |
| `frontend/` | SPA da calculadora | Ainda não criado; bloqueado pela Fase 2.5 |
| `docs/` | Decisões, contratos, auditorias e specs executáveis | Fonte de verdade do projeto |

PostgreSQL é a fonte de verdade. Redis é somente cache e pode ser esvaziado sem perda de dados.

## Requisitos

- Git;
- Docker Desktop com Docker Compose;
- Python 3.13 e [`uv`](https://docs.astral.sh/uv/);
- Go 1.24 ou compatível com o `go.mod` do client;
- Windows com Npcap para captura em jogo, ou libpcap nos demais sistemas.

Não instale Python 3.14 para o backend: o projeto está fixado em `>=3.13,<3.14`.

## Primeiro uso

### 1. Clonar o produto

```powershell
git clone https://github.com/noble-company/albion-profit-pro.git
Set-Location 'albion-profit-pro'
```

### 2. Obter os dados estáticos

Os dumps não são versionados enquanto sua licença de redistribuição não estiver explícita. Baixe
a revisão fixada pelo projeto:

```powershell
$dumpRevision = '5cf2e8e9b7021f98683181fa5b0e3c64575978e4'
Invoke-WebRequest "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/$dumpRevision/formatted/items.json" -OutFile 'items.json'
Invoke-WebRequest "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/$dumpRevision/items.json" -OutFile 'ITEM DUMP.json'
Get-FileHash -Algorithm SHA256 'items.json', 'ITEM DUMP.json'
```

Confira os hashes e a política de atualização em
[`docs/06-fontes-de-dados-estaticos.md`](docs/06-fontes-de-dados-estaticos.md).

### 3. Preparar e iniciar o backend

```powershell
Set-Location 'backend'
Copy-Item '.env.example' '.env'
uv sync
docker compose up -d
uv run alembic upgrade head
uv run python -m scripts.import_items
uv run python -m scripts.import_recipes
```

Em terminais separados:

```powershell
uv run uvicorn src.main:app --reload
```

```powershell
uv run celery -A src.celery_app.celery_app worker --loglevel=info
```

### 4. Compilar o client

```powershell
Set-Location '..\albiondata-client'
go test ./...
go build -o albiondata-client.exe .
Copy-Item 'config.yaml.example' 'config.yaml'
```

Configure `ApiToken` no `config.yaml`. O arquivo real é ignorado pelo Git. No Windows, confirme
que o Npcap está instalado e faça uma troca de zona no jogo antes de abrir o mercado; sem uma
localização válida o client descarta os eventos capturados.

## Desenvolvimento e testes

Backend, a partir de `backend/`:

```powershell
uv run ruff check .
uv run pytest tests/ -v
docker build -t profitpro-backend .
```

Client, a partir de `albiondata-client/`:

```powershell
go test ./...
go vet ./client/
go build -o albiondata-client.exe .
```

Não execute `gofmt -w` indiscriminadamente no fork: o upstream usa CRLF e a reescrita integral
prejudica comparações futuras. Patches próprios devem continuar marcados com
`PATCH LOCAL (Albion Profit Pro)`.

## Status e limitações conhecidas

- Fases 1 e 1.5: backend concluído.
- Fase 2: integração do client concluída e validada no jogo real.
- Fase 2.5: estabilização em andamento, 1 de 14 tasks.
- Fase 3: frontend especificado, mas bloqueado até o gate da Fase 2.5.
- West, East e Europe ainda não estão isolados no contrato persistido; não misture realms.
- O updater do client ainda aponta para o projeto upstream; não publique binários antes da Task
  02 da Fase 2.5.
- O seed da imagem/deploy ainda não é reproduzível; será fechado na Task 10.

O plano, os contratos medidos e os checklists ficam em [`docs/README.md`](docs/README.md). A
prioridade atual é [`docs/tasks/estabilizacao/`](docs/tasks/estabilizacao/README.md).

## Git, upstream e releases

- `origin`: `https://github.com/noble-company/albion-profit-pro.git`;
- branch canônica: `main`;
- o client é uma pasta normal deste monorepo, sem `.git` próprio e sem submódulo;
- upstream do client: <https://github.com/ao-data/albiondata-client>;
- commits devem ser pequenos e descrever uma mudança coerente, preferencialmente no padrão
  Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`);
- não fazer push direto, reescrever `main` ou publicar releases sem revisão e autorização;
- releases do produto usam tags `vMAJOR.MINOR.PATCH`; o canal próprio do client será definido na
  Task 02 da Fase 2.5.

A sincronização com o upstream do client é deliberada: comparar uma revisão conhecida em clone
separado, portar somente mudanças relevantes em commits pequenos, preservar CRLF e reaplicar/testar
todo `PATCH LOCAL`. Nunca apontar o updater ou o `origin` do produto para o upstream.

## Licenças

O fork `albiondata-client` mantém sua licença MIT em `albiondata-client/LICENSE`. As condições de
distribuição do produto e dos dados estáticos devem ser definidas antes da primeira release pública;
até lá, os dumps permanecem fora do Git.
