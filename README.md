<p align="center">
  <img src="frontend/src/assets/marca/logo.webp" alt="Albion Profit Pro" width="160" />
</p>

# Albion Profit Pro

Plataforma própria para calcular lucro de crafting e refino no Albion Online a partir de preços
coletados pelo jogador no mercado do jogo.

> [!WARNING]
> A **Fase 4 (scanner) está concluída, 38/38**: Refino, Craft, Comida & Poções e Calculadora
> calculam no navegador sobre o catálogo inteiro, com preço do nosso client e da API pública do
> Albion Data Project ([`docs/15-arquitetura-do-scanner.md`](docs/15-arquitetura-do-scanner.md)).
> Ela substituiu a Fase 3.6. Falta o que destrava o gate final — serving/deploy do frontend e o
> item "Abrir Calculadora" no systray (tasks 3.6/13 e 3.6/14) — e então a validação integrada em
> jogo (task 19 da Fase 3: Albion + Npcap + systray + Swarm/Traefik reais). O client não deve ser
> distribuído amplamente até lá. `S06` (catálogo sem login) e a antifraude de mercado (`S01`) são
> decisões conscientemente adiadas para o pré-lançamento.

## Arquitetura

```text
Albion Online                                  Albion Data Project (API pública)
    │ tráfego local do mercado                     │ poller Celery a cada 10 min
    ▼                                              │
albiondata-client (Go + Npcap)                     │
    │ POST autenticado                             ▼
    ▼
FastAPI ──► RabbitMQ ──► Celery worker ──► PostgreSQL ──► Redis (cache descartável)
    │
    │ catálogo, topo de livro e volume de vendas (dado, não resposta)
    ▼
Navegador (React) — o engine calcula lucro, ROI e lista de compras de todas as receitas
```

| Diretório | Responsabilidade | Estado |
|---|---|---|
| `albiondata-client/` | Captura preços do tráfego local e envia ao backend | Fase 2 e estabilização concluídas |
| `backend/` | Auth, ingest, catálogo, preços, histórico, poller da API pública, filas e persistência | Fases 1, 1.5, 2.5, o backend da 3.5 e o da Fase 4 concluídos (485 testes: 484 verdes e 1 skip) |
| `frontend/` | Scanner de Refino, Craft, Comida & Poções e Calculadora (engine no navegador), Meus Crafts, Market Flip, Preços, Painel do Destino | Fase 4 concluída; A01–A03 e A05–A07 entregues — 594 testes unitários + suíte E2E Playwright; falta o gate em jogo |
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
$dumpRevision = '0be6a5e74f30fc1312118be3d017f3832f027cef'
Invoke-WebRequest "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/$dumpRevision/formatted/items.json" -OutFile 'items.json'
Invoke-WebRequest "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/$dumpRevision/items.json" -OutFile 'ITEM DUMP.json'
Invoke-WebRequest "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/$dumpRevision/formatted/world.json" -OutFile 'world.json'
Get-FileHash -Algorithm SHA256 'items.json', 'ITEM DUMP.json', 'world.json'
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

**Windows:** o pool padrão do Celery (`prefork`) não funciona neste SO (`WinError 5`, achado `W9`
da Fase 3.5) — acrescente `--pool=solo` em cada comando `worker` acima (ex.:
`uv run celery -A src.celery_app.celery_app worker -Q ingest -c 4 --pool=solo --loglevel=info`).

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

### 5. Frontend

```powershell
Set-Location '..\frontend'
Copy-Item '.env.example' '.env'   # VITE_API_BASE_URL=http://localhost:8000
npm ci
npm run dev                        # http://localhost:5173
```

Precisa do backend no ar (passo 3) para dados reais. `npm run build && npm run preview` serve
o bundle de produção em `http://127.0.0.1:4173`.

## Desenvolvimento e testes

Backend, a partir de `backend/`:

```powershell
uv run ruff check .
uv run pytest tests/ -v
docker build -t profitpro-backend .
```

Frontend, a partir de `frontend/`:

```powershell
npm run lint
npm run typecheck
npm run test           # Vitest — unitário, com MSW
npm run test:coverage  # + gate de cobertura dos módulos de lógica
npm run test:e2e       # Playwright — precisa da stack real; ver frontend/e2e/README.md
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

- Fases 1, 1.5 e 2 concluídas (backend; integração do client validada em jogo).
- Fase 2.5 (estabilização): concluída, 14/14 tasks, gate automatizado verde.
- **Fase 3.5 (refatoração): concluída, 28/29 tasks** — só a `10` (antifraude, `S01`) segue
  aberta, adiada por decisão de produto. O backend foi reescrito nos motores de flip e ranking;
  o design system foi de fato instalado; a camada "e se" roda no cliente; a suíte E2E Playwright
  roda contra API + PostgreSQL + Redis reais. O desfecho de cada achado da revisão está em
  [`docs/12-revisao-fase-3.md`](docs/12-revisao-fase-3.md#desfecho-dos-achados-2026-09-06).
- **Fase 4 (scanner): concluída, 38/38 tasks** — o servidor serve dado (catálogo, topo de livro,
  histórico) e o navegador calcula; nenhuma receita some por falta de preço, todo filtro responde
  sem requisição, e a API pública do Albion Data Project cobre o que o client não viu. Substituiu
  a Fase 3.6. Arquitetura em
  [`docs/15-arquitetura-do-scanner.md`](docs/15-arquitetura-do-scanner.md); tasks em
  [`docs/tasks/scanner/`](docs/tasks/scanner/README.md).
- **Próximo:** as tasks da Fase 3.6 que seguem valendo
  ([`docs/tasks/correcoes/`](docs/tasks/correcoes/README.md)) — a 13 (serving/deploy do frontend,
  que não existe) e a 14 (item "Abrir Calculadora" no systray) primeiro, depois 05, 06, 08, 09, 10,
  15 e 17.
- **Falta o gate final:** o ensaio integrado com Albion/Npcap, systray, domínio e Swarm reais
  (task 19 da Fase 3), executado depois delas para validar a jornada inteira de uma vez.
- **Adiado conscientemente:** antifraude de mercado (`S01`), JWT em cookie `httpOnly` (`S03`),
  catálogo sem login (`S06`) — todos pré-requisitos de lançamento público, não de uso interno.
- West, East e Europe estão isolados no wire autenticado, persistência, cache e leitura desde a
  Task 2.5/03.
- O updater é desabilitado por padrão e rejeita qualquer origem diferente do repositório do
  Profit Pro. A publicação real ainda exige autorização e assinatura manual.
- Não há push de preço em tempo real — o pub/sub foi removido na Fase 3.5 (task 08); o frontend
  faz polling de 30 s com cache e visibilidade de aba.
- Filas e processos de produção foram fechados na Task 2.5/11; o stack de referência ainda
  precisa ser adaptado às redes, secrets e labels reais do Swarm/Traefik.

O plano, os contratos medidos e os checklists ficam em [`docs/README.md`](docs/README.md). A
prioridade atual são as tasks 3.6/13 e 3.6/14, que destravam o gate final (task 19). O gate automatizado da fase é
`python scripts/verify_repository.py` mais os workflows `backend-ci`, `frontend-ci` e
`frontend-e2e`; o procedimento do fechamento da 2.5 está em
[`docs/10-gate-final-fase-2-5.md`](docs/10-gate-final-fase-2-5.md).

## Git, upstream e releases

- `origin`: `https://github.com/noble-company/albion-profit-pro.git`;
- branch canônica: `main`;
- **critério de baseline versionado:** não basta existir `origin` e um commit. Todo o trabalho
  precisa estar publicado — `git status --porcelain` não pode listar nenhum arquivo de fonte
  (`.py`, `.ts`, `.tsx`, `.go`, `.md`) não rastreado. Só caches, artefatos de build e os dumps
  estáticos ficam de fora, sempre via `.gitignore`. Cheque isso antes de dar uma fase por salva;
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
