# Albion Profit Pro — Plataforma própria de calculadora de crafting/refino

> Plano macro do projeto. Guia a ordem de construção; detalhes de implementação de cada fase são planejados à parte quando a fase começa.

## Status atual (2026-08-23)

> ⚠️ **Atualização do fim do dia 2026-08-22.** Depois de a Fase 1 ser fechada, foram feitas duas
> coisas que mudaram o quadro: uma **revisão completa do backend**
> ([04-revisao-fase-1.md](04-revisao-fase-1.md)) e a **primeira captura do jogo ao vivo**
> ([03-contrato-ingest-real.md](03-contrato-ingest-real.md)).
>
> O resultado: a Fase 1 está estruturalmente correta, mas **não está pronta pra produção**.
> Dois motivos, os dois confirmados:
> 1. O caminho de escrita do ingest **nunca rodou de verdade** — os testes chamam as corotinas
>    internas, nunca o wrapper Celery. É justamente ali que está o bug mais grave (`C1`).
> 2. Toda a Fase 1 foi construída contra **payloads inventados**. O dado real revelou três
>    propriedades semânticas (prata ×10.000, `Timescale` não é identidade, `LocationId` não é
>    numérico) que invalidam cálculos e duplicam linhas.
>
> A Fase 1.5 (tasks 23-36) nasceu pra corrigir isso antes da Fase 2 — **concluída em
> 2026-08-22**, ver abaixo.

**Fase 1 + Fase 1.5 (Backend) — completas, 36/36 tasks.** Ver checklist detalhado em [tasks/backend/README.md](tasks/backend/README.md). Resumo do que existe e já foi testado contra serviços reais (não só escrito):
- Auth: JWT (`fastapi-users`) pro frontend + token opaco (`ApiToken`, hasheado no banco) pro client Go.
- Pipeline de ingest completo, com ciclo de vida async correto no worker e retry/logging: `POST /marketorders.ingest`/`/markethistories.ingest`/`/goldprices.ingest` → RabbitMQ → worker Celery → Postgres + cache Redis.
- Semântica do dado corrigida contra o contrato real medido no jogo ([03-contrato-ingest-real.md](03-contrato-ingest-real.md)): prata ÷10⁴, ticks .NET → `TIMESTAMPTZ`, `market_order`/`market_history_entry` remodelados (estado atual do livro / bucket global idempotente), tabela `item`+`location` (ponte `Index ↔ UniqueName`, locais dinâmicos).
- Leitura de preços cache-first, por lado do livro e profundidade, com cobertura por usuário (`GET /items/{id}/prices?scope=all|mine`), retenção + rollup diário/mensal e `GET /items/{id}/demand`.
- Hardening HTTP (CORS, `/ready`, rate limit, limites de payload) e migrations validadas em produção (imagem roda como não-root).
- Dados estáticos com seed reproduzível e auditável (`backend/scripts/seed_static_data.py`): revisão e checksums fixados, **12.062 itens** e **5.633 receitas**, reexecução idempotente e troca atômica do catálogo.
- Suíte de testes com `testcontainers` (Postgres/Redis/RabbitMQ efêmeros) — **281 testes**, sobre fixtures compartilhadas e payloads reais capturados do jogo, sem limpeza manual entre testes.
- `Dockerfile` multi-stage validado e não-root. A imagem executa Alembic e o seed; migration/seed/worker/beat ainda precisam ser materializados no stack (Fase 2.5 task 11), e migration não roda no boot da API.
- Observabilidade: `structlog` (JSON, também no worker) + `/health`/`/ready`.

**Nota de implementação**: a estrutura real ficou domain-driven (`backend/src/auth/`, `src/ingest/`, `src/prices/`, `src/recipes/`, `src/api_tokens/`, `src/items/`, `src/cache/`, cada um com `router.py`/`schemas.py`/`models.py`/`service.py`) em vez do esboço `app/main.py`/`app/models.py`/`app/routers/` descrito originalmente na seção "Fase 1" abaixo — aquela seção é o desenho inicial (mantido como registro histórico da decisão), a fonte de verdade do que foi de fato implementado é `docs/tasks/backend/` (36 arquivos de task, um por microetapa).

**Fase 2 (client Go) — ✅ completa (2026-08-23), 7/7 tasks.** Quebrada em microetapas em
[tasks/client/](tasks/client/README.md): token de API configurável (01), uploader autenticado via
o pseudo-esquema `http+token://` (02), destino de ingest apontando pro nosso backend (03),
validação de token e absorção dos tópicos não consumidos (04), conserto do aviso de localização
(05), investigação do protocolo de craft (06) e validação ponta a ponta em jogo (10) — as tasks
07-09 (captura de craft/refino) foram descopadas, ver nota abaixo. O client fala com o nosso
backend de verdade, com dado real confirmado no Postgres.

> ⚠️ **Correção (2026-08-23, achado `F1`):** a versão anterior desta seção dizia que bastaria
> apontar o **`-p`** (ingest privado) pro nosso backend. **Isso está errado.** Todo o dado que a
> calculadora precisa — `marketorders`, `markethistories`, `goldprices` — sobe pelo canal
> **público** (`sendMsgToPublicUploaders`); o `-p` só carrega `skills` e `marketnotifications`.
> Apontar o `-p` pro nosso backend não traria dado de mercado nenhum. Pior: como
> `sendMsgToPublicUploaders` faz fan-out pras **duas** listas de uploader
> (`client/dispatcher.go`), configurar `-p` igual ao `-i` faria todo payload de mercado chegar
> **duplicado**. Por isso o `-p` fica vazio e a Fase 2 mexe no `-i`.

> **Escopo reduzido em 2026-08-23:** as tasks 07-09 (captura de craft/refino em tempo real) foram
> **descopadas**. A calculadora é ferramenta de **planejamento** — taxa de estação, taxa de retorno
> e quantidade a produzir são **informadas pelo jogador**, então nenhum insumo do cálculo vem de
> evento de craft. Isso reconcilia com o desenho original da Fase 3 abaixo, que já descrevia o
> cálculo de lucro assim. A investigação da task 06 não foi perdida: virou
> [doc 03 §8b](03-contrato-ingest-real.md), que corrigiu três interpretações erradas do doc 01
> sobre o protocolo de craft. Racional em
> [tasks/client/README.md](tasks/client/README.md#por-que-07-09-foram-descopadas-2026-08-23).

**Fase 2.5 (estabilização) — ✅ concluída, 14/14 tasks.** Updater, realm, rollups, uploader
concorrente, seed reproduzível, operação Celery, documentação e gate automatizado foram
estabilizados. A validação de boot bloqueia release sem destino, token inválido e realm
desconhecido. A semântica/escala do livro declara cobertura parcial e consulta apenas combinações
observadas. Diagnóstico em [05-revisao-fases-0-a-2.md](05-revisao-fases-0-a-2.md), execução em
[tasks/estabilizacao/](tasks/estabilizacao/README.md). O ensaio integrado Windows/jogo/Swarm foi
transferido para a Task 19 da Fase 3.

**Fase 3 — 18/19.** O produto foi reorganizado para rankings de Market Flip, Refino e Craft.
Só falta a task 19 (gate integrado em jogo), executada depois da Fase 3.5.

**Fase 3.5 (refatoração) — ✅ concluída, 28/29 tasks.** Só a task `10` (antifraude, `S01`)
segue aberta, adiada por decisão de produto. Derivada da auditoria
[12-revisao-fase-3.md](12-revisao-fase-3.md): reescreveu os motores de flip (SQL, `B01`) e
ranking (materializado, `B02`), instalou o design system que a task 09 decidiu e nunca
instalou (`F01`–`F03`), moveu a camada "e se" para o cliente com vetores dourados travando a
paridade com o Python, e entregou a suíte E2E Playwright (`A03`). Três decisões de
arquitetura em [12-revisao-fase-3.md](12-revisao-fase-3.md#decisões-de-arquitetura-da-fase-35):
o cálculo é dividido por *o que muda* (não *onde roda*), o frontend é reconstruído por cima
(não recomeçado), e a antifraude é adiada conscientemente para o pré-lançamento.

**Fase 3.6 (correções) — 0/17 tasks.** Derivada da auditoria
[14-revisao-fase-3-5.md](14-revisao-fase-3-5.md), feita a partir da execução real dos gates. A
Fase 3.5 foi confirmada como entregue — os números declarados batem no dígito — mas sobreviveram
a ela um cálculo do cliente que diverge do motor Python (`E01`), dois caminhos de tela branca
(`E02`/`E03`, sem `ErrorBoundary` no projeto, `E04`), um formulário que falha em silêncio na
Calculadora (`E05`), o `client-ci` vermelho desde 31/08 (`E06`) e guards que passam sem verificar
o que prometem (`E10`). A fase também tira a implementação de dentro da task 19 (`P01`) e
constrói a premissa que falta para a Fase 4 (`P02`). Ordem e status em
[tasks/correcoes/](tasks/correcoes/README.md).

**Fase 4 — não começou.** Depende da task 19 e do deploy; ver a ordem de implementação abaixo.

## Contexto

O mapeamento do `albiondata-client` (documentado em [01-mapeamento-albiondata-client.md](01-mapeamento-albiondata-client.md)) já confirmou que o client **já captura tudo que é necessário para a calculadora** — ordens de compra/venda do mercado e histórico de preços, em todas as cidades (`opAuctionGetOffers`/`opAuctionGetRequests`/`opAuctionGetItemAverageStats`, ver `client/operation_auction_get_offers.go`, `client/operation_auction_get_requests.go`, `client/operation_auction_get_item_average_stats.go`). Não é preciso nenhum trabalho adicional de reverse-engineering do protocolo para o MVP — o trabalho de decifrar `evCraftItemFinished` (craft/refino em tempo real) fica para uma fase futura, fora do escopo deste plano.

O usuário quer construir uma **plataforma própria**, não só usar o client vanilla:
1. Uma **calculadora de crafting/refino**: usuário escolhe um item (ex: T2 Fiber), vê preços de compra/venda em todas as cidades com timestamp da última coleta, e o app calcula lucro (preço de venda do item craftado − custo das matérias-primas nos preços atuais − taxas).
2. **Infraestrutura própria**: o client passa a mandar os dados pro backend deles, não pro ingest público do Albion Data Project.
3. **Login + vínculo de personagem**: usuário cria conta (email/senha), e os dados que o client dele captura ficam associados à conta.
4. **Dados públicos vs. privados**: usuário escolhe entre ver os preços agregados de todos os usuários da plataforma ("públicos", entre aspas — na real é só "de todo mundo que usa nosso client") ou só os preços que ele mesmo coletou.
5. Interface tanto **na página web** quanto **dentro do próprio client** (systray já existe em `client/systray/`).

Decisões já confirmadas com o usuário:
- **Backend**: Python/FastAPI.
- **Hospedagem**: VPS/cloud desde já (banco compartilhado entre todos os usuários da plataforma) — o usuário já tem um servidor rodando em **Docker Swarm** com **Traefik**, **PostgreSQL 16 (com pgvector)**, **Redis** e **RabbitMQ** já disponíveis. Vamos reaproveitar tudo isso em vez de subir infra nova (ver seção "Infraestrutura existente" abaixo).
- **Login**: email + senha próprio (sem OAuth por enquanto).
- **Interface**: web app E embutida no client, desde o início do MVP.
- **Ingest via fila**: o endpoint de ingest publica no RabbitMQ em vez de gravar direto no Postgres; um worker separado consome e grava em lote — decidido usar isso **desde o MVP** (não só como otimização futura), já que a infra já existe.
- **Deploy**: o usuário tem um padrão próprio de `stack.yml`/convenções de rede overlay/labels do Traefik para novos serviços no swarm — será compartilhado quando chegarmos na fase de deploy (por enquanto, seguir convenções típicas de Traefik+Swarm como placeholder).
- **Migration em produção** (task 34, `docs/tasks/backend/34-migrations-em-producao-e-dockerfile.md`): um serviço `migrate` dedicado no `stack.yml`, `command: alembic upgrade head` + `deploy.restart_policy.condition: none` — roda uma vez até o fim e sai; API e worker dependem dele subir com sucesso antes de iniciar. **Não** um `alembic upgrade head` no entrypoint da API (N réplicas subindo juntas disputariam a migration ao mesmo tempo) e **não** no worker. `alembic` já é dependência de runtime da imagem (`pyproject.toml`, não mais só em `dev`) — a mesma imagem builda o serviço `migrate`, a API e o worker, só troca o `command:`. Ainda falta o `stack.yml` real do usuário pra materializar isso.

## Arquitetura proposta

```
Albion Profit Pro/
├── docs/                    (este diretório — plano macro + notas/documentação do projeto)
├── albiondata-client/       (fork já clonado — ainda vanilla, modificações da Fase 2 pendentes)
├── backend/                 (Fase 1 completa — FastAPI + worker Celery/RabbitMQ + PostgreSQL, ver docs/tasks/backend/)
├── frontend/                (NOVO — React + Vite, SPA da calculadora)
├── ITEM DUMP.json           (já existe — dump de items.xml com receitas de craft/refino, ver 02-dados-de-receita.md)
└── items.json               (já existe — dump de nomes localizados)
```

### Infraestrutura existente (reaproveitada, não criada do zero)
O usuário já tem um servidor em **Docker Swarm** com estes serviços rodando:
- **Traefik** — reverse proxy do swarm; o backend/frontend entram como novos serviços com labels de roteamento, sem precisar configurar nginx à parte.
- **PostgreSQL 16 (+ pgvector)** — cria-se um banco novo dedicado ao Profit Pro na mesma instância. `pgvector` não é usado no MVP, mas fica disponível para uma feature futura (ex: busca semântica de itens).
- **Redis** — cache de "preço mais recente por item/cidade" (evita bater no Postgres a cada carregamento da calculadora). **O push de preço em tempo real por pub/sub foi descartado na Fase 3.5 (task 08, `B10`)**: não havia consumidor WebSocket/SSE e o frontend faz polling com cache e visibilidade. Um push persistente entra quando o volume de usuários justificar.
- **RabbitMQ** — usado desde o MVP no pipeline de ingest (ver abaixo), não só como otimização futura.

### Fluxo de dados
```
Client Go (usuário A, B, C...)
  → cada client carrega um token pessoal de API (novo campo no config.yaml)
  → uploader HTTP já existente (client/uploader_http.go) faz POST para
    <API_BASE_URL>/<topic>  (ex: /marketorders.ingest)
    — ZERO mudança de protocolo necessária, o client já monta esse payload;
      só precisa (a) apontar -i para nossa API e (b) anexar o token no header
  → Backend FastAPI recebe, valida o token, publica a mensagem no RabbitMQ
    (exchange/routing key por tópico — ex: marketorders.ingest) e responde
    rápido ao client (não espera o banco)
  → Worker separado (consumer) lê da fila, faz upsert em lote no Postgres
  → Redis: worker atualiza o cache de "preço mais recente" após gravar
  → Frontend (web ou embutido) consulta a API de leitura (GET /prices?item=...),
    que lê do Redis (cache) com fallback pro Postgres, e monta a calculadora.
    Atualização por polling com cache e visibilidade — sem push (task 08).
```

**Por que isso é pouco código no client**: o `client/uploader_http.go` já faz exatamente `POST <baseURL>/<topic>` com o JSON de upload. Rodar `-i https://api.albionprofitpro.com` já funciona sem tocar em nada — só falta (1) autenticar a requisição e (2) trocar o default. Fora isso, o client continua 100% igual ao vanilla para captura de mercado.

**Por que RabbitMQ desde o MVP**: os clients mandam dados em rajada (ex: "50 ordens de mercado de uma vez" quando o jogador abre o mercado in-game — já visto nos logs reais do client). Publicar na fila e responder na hora desacopla esse pico da capacidade de escrita do banco; o worker consome e grava em lote no seu próprio ritmo, sem risco de derrubar a API sob carga.

## Fase 1 — Backend (FastAPI + RabbitMQ + PostgreSQL) ✅ Completa

**Esta seção é o desenho original (esboço inicial de arquitetura), mantida como registro histórico.** A implementação real seguiu `docs/tasks/backend/` (22 microtasks) e divergiu em estrutura de pastas (`src/` domain-driven em vez de `app/` por tipo de arquivo — ver `CLAUDE.md` "Key architecture decisions" pro layout real) e em alguns detalhes (ex: dados de receita ganharam suporte a encantamento/upgrade, não previsto aqui). Pra saber exatamente o que existe hoje, use `docs/tasks/backend/README.md`, não esta seção.

Novo diretório `backend/`, com dois processos/serviços (API e worker), compartilhando os mesmos modelos:
- `app/main.py` — app FastAPI, monta os routers
- `app/database.py` — engine SQLAlchemy + sessão, config via env var `DATABASE_URL` (aponta pro Postgres 16 existente, banco novo dedicado)
- `app/models.py` — tabelas: `User` (id, email, password_hash, created_at), `ApiToken` (id, user_id, token, created_at, revoked_at), `MarketOrder` (espelha `lib.MarketOrder` do Go: item_id, quality_level, enchantment_level, location_id, price, amount, auction_type, expires, collected_at, user_id, is_public), `MarketHistory` (espelha `lib.MarketHistoriesUpload`), `Recipe`/`RecipeIngredient` (dados estáticos de craft, ver Fase 1b)
- `app/auth.py` — hash de senha (passlib/bcrypt), criação de JWT de sessão pro frontend, geração/validação de `ApiToken` pro client Go (token opaco, tipo `apk_<random>`, não expira a menos que revogado)
- `app/routers/auth.py` — `POST /auth/register`, `POST /auth/login`, `POST /auth/tokens` (gera um `ApiToken` novo pro usuário logado, pra colar no `config.yaml` do client)
- `app/routers/ingest.py` — replica os tópicos que o client já manda: `POST /marketorders.ingest`, `POST /markethistories.ingest`, `POST /goldprices.ingest` (ver `lib/nats.go` pros nomes exatos de tópico) — autentica via header `Authorization: Bearer <ApiToken>`, **publica a mensagem no RabbitMQ** (exchange dedicado, routing key = nome do tópico) em vez de gravar direto, responde rápido ao client
- `app/routers/prices.py` — `GET /items/{item_id}/prices?scope=all|mine` — lê do Redis (cache "preço mais recente"), com fallback pro Postgres em cache-miss
- `app/worker.py` — processo consumer separado (roda como outro serviço no swarm): assina as filas do RabbitMQ, faz upsert em lote no Postgres e atualiza o cache no Redis (sem pub/sub — ver task 08)
- `alembic/` — migrations
- `Dockerfile` (um só, dois entrypoints: API via uvicorn, worker via `python -m app.worker`) — deploy como dois serviços separados no `stack.yml` do swarm (conectar nas redes overlay existentes do Postgres/Redis/RabbitMQ/Traefik)

### Fase 1b — Dados de receita (crafting/refino) ✅ Completa (task 19, revisada 2026-08-21)
`items.json` **não tem** dados de receita — é só um dump de nomes localizados. `ITEM DUMP.json` (dump do `items.xml` oficial, via `ao-bin-dumps`) **tem** os nós `craftresource` com ingredientes, quantidade, foco necessário e taxa de prata por receita. Detalhes do formato em [02-dados-de-receita.md](02-dados-de-receita.md).

`backend/scripts/import_recipes.py` está escrito e já rodou contra os arquivos reais: **5553 receitas** importadas (2289 base + 3264 variações encantadas), incluindo o custo de upgrade (`upgrade_resource_*`) — extensão pedida pelo usuário depois da implementação inicial, pra suportar "vale mais comprar encantado, craftar encantado, ou craftar base e upgradar?". ~3200 itens/níveis com receita múltipla (`craftingrequirements` como lista — achado real do dump, não previsto originalmente) ficam de fora por enquanto, documentado como pendência em `docs/02-dados-de-receita.md`.

## Fase 2 — Modificações no client Go

> **Esta seção é o desenho original.** A implementação real seguiu
> [tasks/client/](tasks/client/README.md), com desvios registrados lá. Os itens 1-3 abaixo estão
> ✅ **feitos** (tasks 01-03); o item 4 foi adiado pra Fase 3/4 (depende do frontend existir).

Mudanças mínimas em `albiondata-client/`:
1. ✅ **`client/config.go`**: novo campo `ApiToken` + flag `-token` (ou lido do `config.yaml` via viper, junto dos campos de websocket que já existem) — evita expor o token em texto puro na linha de comando do usuário final. *(task 01)*
2. ✅ **`client/uploader_http.go`**: anexar header `Authorization: Bearer <ApiToken>` na requisição POST (hoje ela só seta `Content-Type`, ver linhas ~25-57). *(task 02 — o header vai **só** pros destinos marcados com o pseudo-esquema `http+token://`, pra não vazar o token se o `-i` tiver mais de um destino)*
3. ✅ **Default do `-i`**: o client **deixou de contribuir com o Albion Data Project** — decisão explícita do usuário em 2026-08-23. `http+token://localhost:8000` existe somente no perfil de desenvolvimento; desde a Task 13, release sem URL oficial/config explícita inicia com upload bloqueado. *(tasks 03 e 13)*
4. **`client/systray/*.go`**: novo item de menu "Abrir Calculadora" que abre a UI embutida (Fase 4) ou, na primeira versão mais simples, só abre o navegador padrão na URL do frontend (`os/exec` + `start`/`open` conforme o SO) — via mais rápida de entregar "interface no client" sem a complexidade de um webview nativo.

### Itens adicionados pela captura ao vivo de 2026-08-22

Descobertos rodando o client de verdade contra o jogo (ver
[03-contrato-ingest-real.md](03-contrato-ingest-real.md) e os achados `N5`/`N6` de
[04-revisao-fase-1.md](04-revisao-fase-1.md)):

5. **Bug do upstream já corrigido localmente (`N5`)**: `operation_auction_get_offers.go:47`
   chamava `log.Fatal` quando uma entrada do livro não era JSON válido — **derrubava o client
   inteiro**. O handler irmão (`operation_auction_get_requests.go:29`) já tratava o mesmo erro
   com `log.Errorf`. Aplicado patch local (`log.Errorf` + `continue`), marcado com o comentário
   `PATCH LOCAL`. Decidir se vira PR pro upstream.
6. **Transição de zona é obrigatória (`N6`)**: o client descarta **tudo** enquanto
   `IsValidLocation()` for falso, e a localização só é aprendida numa troca de zona. Iniciado
   com o jogador já parado na cidade, nada sobe — silenciosamente, só com um `ERRO` no log.
   **Usuários vão bater nisso direto.** Precisa de tratamento de produto: detectar o estado e
   avisar na bandeja/UI ("ande até outra zona pra ativar a coleta"), não deixar o usuário achar
   que está coletando quando não está.
7. **Conceito de servidor (west/east/europe) — resolvido na Fase 2.5 task 03**: o client envia
   `X-Albion-Server` no canal autenticado e realm integra fatos, unicidades, rollups, cache
   e leituras. `market_order` deduplica por `(server_id, source_id)`; as APIs exigem
   `server` explicitamente. O legado teve origem West confirmada pelo proprietário.

**Confirmado nesta captura**: a tabela de opcodes do fork **não derivou** em relação à build
atual do jogo — 81 (`opAuctionGetOffers`), 82 (`opAuctionGetRequests`) e 95
(`opAuctionGetItemAverageStats`) casaram com o tráfego real. Não há trabalho de re-mapeamento
pendente.

## Fase 2.5 — Estabilização e prontidão para escalar ✅ 14/14

Fase transversal criada a partir da revisão de 2026-08-23. Corrige distribuição do fork,
versionamento, isolamento West/East/Europe, integridade de rollups/escopo, semântica de falha,
validação/segurança, resiliência do uploader, seed e operação Celery. A ordem completa e o gate de
saída estão em [tasks/estabilizacao/README.md](tasks/estabilizacao/README.md).

Esta fase não implementa frontend. Ela estabiliza o contrato que as 19 tasks da Fase 3 vão
consumir, evitando consolidar APIs enganosas ou chaves sem realm na SPA.

## Fase 3 — Calculadora web (API de craft + React/Vite) — 18/19

O escopo detalhado e a ordem de implementação estão em
[tasks/frontend/](tasks/frontend/README.md): **19 microtasks**, revisadas contra o código real em
2026-08-23. A fase começou completando o backend (catálogo, API de receitas, contrato monetário,
simulação e comparação) e então criou a SPA. A task 18 (resiliência + E2E) foi entregue pela
Fase 3.5/27; só falta a **task 19** — o gate integrado em jogo.

Decisões centrais:

- regra monetária no backend, com `Decimal`; frontend apenas apresenta;
- busca no catálogo PostgreSQL, sem enviar `items.json` de 24 MB ao navegador;
- quatro cenários de mercado (insumo imediato/buy order × venda imediata/sell order);
- execução imediata consome a profundidade real do livro, incluindo slippage;
- comparação por cidade e rotas encantadas com upgrades encadeados;
- React 19 + Vite 8 + TypeScript estrito + Tailwind 4 + shadcn/ui + TanStack Query;
- Vitest/RTL/MSW e Playwright contra backend/datastores reais;
- build de produção servido em mesma origem, com a decisão final conferida contra o padrão real de
  Swarm/Traefik antes da task 18.

## Fase 3.5 — Refatoração ✅ 28/29

Fase transversal criada a partir da auditoria [12-revisao-fase-3.md](12-revisao-fase-3.md)
(2026-08-30). Corrige os motores de oportunidade (flip em SQL, ranking materializado),
instala o design system que a Fase 3 decidiu e nunca instalou, move a camada "e se" para o
cliente e entrega a suíte E2E. Ordem e status em
[tasks/refatoracao/README.md](tasks/refatoracao/README.md); desfecho de cada achado e quadro
de performance antes/depois em
[12-revisao-fase-3.md](12-revisao-fase-3.md#desfecho-dos-achados-2026-09-06). As tasks `10`
(antifraude, `S01`) e `19` (gate em jogo) ficam abertas por decisão.

## Fase 4 — UI embutida no client (fast-follow, não bloqueia o MVP)

Trocar o "abrir navegador" da Fase 2 por um webview nativo embutido (`github.com/webview/webview` tem bindings Go), carregando a mesma URL do frontend dentro de uma janela própria do client — reaproveita 100% do frontend, sem duplicar UI. Fica pra depois de Fases 1-3 estarem funcionando ponta a ponta.

## Arquivos críticos
- `albiondata-client/client/uploader_http.go` — onde adicionar o header de auth
- `albiondata-client/client/config.go` — onde adicionar o campo/flag de token
- `albiondata-client/lib/nats.go`, `lib/market.go`, `lib/marketHistory.go` — contrato exato dos tópicos/JSON que o backend precisa replicar
- `albiondata-client/client/systray/systray_win.go` (e variantes `_darwin`/`_others`) — onde adicionar o item de menu
- `items.json` (raiz do projeto) — fonte de nomes de item pro frontend/backend
- `ITEM DUMP.json` (raiz do projeto) — fonte de receitas de craft/refino pro backend

## Verificação
1. ✅ **Backend local** — feito e testado repetidamente ao longo da Fase 1: API + worker sobem contra o Postgres/Redis/RabbitMQ do docker-compose de dev; `/auth/register`+`/auth/login` funcionam; token gerado, `POST /marketorders.ingest` publica na fila de verdade, worker consome e grava no banco (confirmado via `SELECT` real, não só o teste automatizado).
2. ✅ **Client apontando pro backend local — confirmado em 2026-08-23** ([task 10](tasks/client/10-validacao-ponta-a-ponta.md)). Pipeline completo `jogo → client → backend real → Postgres`, sem sink nem simulação: `./albiondata-client.exe -token apk_...` (default do `-i`, task 03) com o Albion aberto, personagem em cidade `1002`, comprando/vendendo T2_FIBER. 11 tarefas processadas pelo worker, 0 erros, 0 avisos de `N6`. Escala de prata confirmada contra a UI do jogo (34-39 prata por T2_FIBER, faixa idêntica à medida em agosto), `LocationId` numérico (`N3`), sem duplicação de leilão (`C2` — upsert intacto), token nunca apareceu no `albiondata-client.log`. Suítes automatizadas (backend 131 testes, client 31 testes) verdes após o teste.
3. **Frontend**: rodar local (`npm run dev`), logar, gerar token, ver os preços aparecerem na tela após o client mandar dados (via cache Redis + fallback Postgres).
4. **Cálculo de lucro**: validar manualmente um item conhecido (ex: T2_FIBER → T2_CLOTH) comparando o resultado da calculadora com uma conta feita à mão.

## Ordem de implementação recomendada
1. ~~Backend: modelos + auth + endpoint de ingest publicando no RabbitMQ + worker consumindo e gravando no Postgres~~ ✅ **Completo** (Fase 1, 22/22 tasks) — fluxo client→fila→banco validado end-to-end com payloads simulados via `curl`+worker real; ainda não testado com o client Go de verdade (ver item 2).
2. ~~Fase 1.5 — correções do backend~~ ✅ **Completo** (tasks 23-36, ver
   [tasks/backend/README.md](tasks/backend/README.md)). Passou na frente da Fase 2 porque o
   worker não sobrevivia ao segundo payload (`C1`) e porque a semântica do dado real invalidava
   os cálculos (`N1`/`N2`/`N3`) — os dois corrigidos.
3. ~~Client — header de auth, token configurável e validação real~~ ✅ **Completo** (Fase 2,
   [tasks/client/](tasks/client/README.md)).
4. ~~Recipes: decidir onde `ITEM DUMP.json` mora no repo, escrever o import pra `Recipe`/`RecipeIngredient`~~ ✅ **Completo** (Fase 1b, task 19) — falta só torná-lo reexecutável (task 35).
5. ~~Fase 2.5 — estabilização~~ ✅ **Completa, 14/14 tasks**, ver
   [tasks/estabilizacao/](tasks/estabilizacao/README.md).
6. ~~Fase 3 — API de craft + frontend completo~~ ✅ **18/19**, ver
   [tasks/frontend/](tasks/frontend/README.md).
7. ~~Fase 3.5 — refatoração~~ ✅ **28/29**, ver [tasks/refatoracao/](tasks/refatoracao/README.md).
8. **Próximo passo:** Fase 3.6 — correções da revisão da 3.5, ver
   [tasks/correcoes/](tasks/correcoes/README.md). As tasks 01-04 são defeitos de usuário final e
   vêm antes de tudo; a task 13 tira do gate 19 a implementação de serving/deploy do frontend, e
   a 14 constrói o item de systray que a Fase 4 pressupõe.
8b. Task 19 — gate integrado em jogo (Albion + Npcap + systray + Swarm/Traefik reais), validando
   a jornada inteira de uma vez, já sobre o frontend publicado pela task 3.6/13.
9. Deploy no Swarm é materializado dentro da Fase 2.5 (seed/filas/processos) e finalizado no gate
   19 com o frontend/Traefik, usando o padrão real do usuário.
10. (Depois) Fase 4 — webview embutido no client.

## Próximos passos em aberto (do mapeamento do client)
Ficaram pendências da investigação de craft/refino em tempo real (fora do MVP, ver [01-mapeamento-albiondata-client.md](01-mapeamento-albiondata-client.md) seção 8) — não bloqueiam o MVP da calculadora baseada em mercado, mas ficam registradas pra quando entrarmos nessa fase:
- Confirmar se o campo `0` (ator) de `evCraftItemFinished`/`evCraftingFocusUpdate` corresponde ao `CharacterId` do jogador local, pra filtrar eventos de outros jogadores.
- Testar um craft real (só fizemos refino até agora).
- Confirmar o significado exato dos bytes do campo `4` (quantidade por tick).
