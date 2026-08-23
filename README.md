# Albion Profit Pro

Plataforma própria para calcular lucro de crafting e refino no Albion Online a partir de preços
coletados pelo jogador no mercado do jogo.

> [!WARNING]
> O projeto está na Fase 2.5 de estabilização. Backend e coleta funcionam ponta a ponta, mas o
> client ainda não deve ser distribuído amplamente até concluir os gates restantes de configuração
> no ambiente real e validação E2E.

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
| `albiondata-client/` | Captura preços do tráfego local e envia ao backend | Fase 2 e estabilização concluídas |
| `backend/` | Auth, ingest, preços, receitas, filas e persistência | Fases 1, 1.5 e estabilização concluídas |
| `frontend/` | SPA da calculadora | Ainda não criado; próximo passo |
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

### 2. Dados estáticos

Os dumps não são versionados enquanto sua licença de redistribuição não estiver explícita. O job
de seed baixa a revisão imutável registrada em `backend/datasets/` e valida tamanho, SHA-256 e
contagens. Para trabalhar offline, obtenha os arquivos antecipadamente:

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
uv run python -m scripts.seed_static_data
# Com os dumps na raiz: uv run python -m scripts.seed_static_data --dataset-dir ..
```

Em terminais separados:

```powershell
uv run uvicorn src.main:app --reload
```

```powershell
uv run celery -A src.celery_app.celery_app worker -Q ingest -c 4 --loglevel=info
uv run celery -A src.celery_app.celery_app worker -Q maintenance -c 1 --loglevel=info
uv run celery -A src.celery_app.celery_app worker -Q quarantine -c 1 --loglevel=info
uv run celery -A src.celery_app.celery_app beat --loglevel=info
```

### 4. Compilar o client

```powershell
Set-Location '..\albiondata-client'
go test ./...
go build -o albiondata-client.exe .
Copy-Item 'config.yaml.example' 'config.yaml'
```

Configure `PublicIngestBaseUrls` e `ApiToken` no `config.yaml`. O arquivo real é ignorado pelo Git.
Build local usa localhost; release sem URL explícita bloqueia uploads. O client valida `/client/me`
no boot e mostra o estado no systray. No Windows, confirme que o Npcap está instalado e faça uma
troca de zona no jogo antes de abrir o mercado; sem localização/realm válidos o client segura os
eventos capturados.

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
- Fase 2.5: estabilização concluída, 14/14 tasks. O gate automatizado está verde.
- Fase 3: frontend especificado e liberado como próximo passo.
- O ensaio integrado com Albion/Npcap, systray, domínio e Swarm reais será executado após o
  frontend completo, para validar toda a jornada de uma vez.
- West, East e Europe estão isolados no wire autenticado, persistência, cache e leitura desde a
  Task 03.
- O updater é desabilitado por padrão e rejeita qualquer origem diferente do repositório do
  Profit Pro. A publicação real ainda exige autorização e assinatura manual.
- O seed estático reproduzível foi fechado na Task 10. A semântica parcial e a escala da leitura
  do livro foram fechadas na Task 12; a janela padrão de 6h ainda requer validação de produto.
- Filas e processos de produção foram fechados na Task 11; o stack de referência ainda precisa ser
  adaptado às redes, secrets e labels reais do Swarm/Traefik.
- A Task 13 tornou releases fail-closed e adicionou autenticação no boot; ainda falta definir a URL
  oficial e validar visualmente os estados do systray no Windows.

O plano, os contratos medidos e os checklists ficam em [`docs/README.md`](docs/README.md). A
prioridade atual é [`docs/tasks/estabilizacao/`](docs/tasks/estabilizacao/README.md).
O procedimento e as evidências do fechamento estão no
[`docs/10-gate-final-fase-2-5.md`](docs/10-gate-final-fase-2-5.md).

## Git, upstream e releases

- `origin`: `https://github.com/noble-company/albion-profit-pro.git`;
- branch canônica: `main`;
- o client é uma pasta normal deste monorepo, sem `.git` próprio e sem submódulo;
- upstream do client: <https://github.com/ao-data/albiondata-client>;
- commits devem ser pequenos e descrever uma mudança coerente, preferencialmente no padrão
  Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`);
- não fazer push direto, reescrever `main` ou publicar releases sem revisão e autorização;
- releases do produto usam tags `vMAJOR.MINOR.PATCH`; os artefatos e checksums são gerados pelo
  workflow próprio, com updater desabilitado até existir assinatura de código;
- a política completa está em [`docs/07-releases-do-client.md`](docs/07-releases-do-client.md).

A sincronização com o upstream do client é deliberada: comparar uma revisão conhecida em clone
separado, portar somente mudanças relevantes em commits pequenos, preservar CRLF e reaplicar/testar
todo `PATCH LOCAL`. Nunca apontar o updater ou o `origin` do produto para o upstream.

## Licenças

O fork `albiondata-client` mantém sua licença MIT em `albiondata-client/LICENSE`. As condições de
distribuição do produto e dos dados estáticos devem ser definidas antes da primeira release pública;
até lá, os dumps permanecem fora do Git.
