# 19 — Build e validação final

> A implementação (build multi-stage, serving da SPA e base URL de mesma origem) saiu daqui e
> foi entregue pela [Fase 3.6, task 13](../correcoes/13-serving-e-deploy-do-frontend.md)
> (2026-09-22), mesmo precedente da 3.5/27 sobre a task 18. Esta task fica sendo só o que o
> nome do bloco da Fase 3.6 já dizia: o ensaio integrado em jogo — validação real com Albion
> Online aberto, contra o bundle publicado pela imagem de produção, não pelo `vite dev`.

## Objetivo
Publicar a SPA e validar o produto com dados reais do jogo.

## O que implementar
- Build multi-stage único para frontend/API/worker/migrations.
- Serving da SPA com fallback apenas para HTML e assets com cache correto.
- Base URL de mesma origem em produção e CORS apenas no desenvolvimento.
- Validação real: coleta, Market Flip entre cidades, refino, craft, taxas, retorno, Premium, foco,
  timestamps, warnings e recuperação de indisponibilidade.
- Registrar evidências e atualizar documentação de fórmulas e operação.

## Depende de
Task 18.

## Testes manuais
Executar os três fluxos principais com Albion Online aberto e confirmar os valores contra conta manual.

## Testes automatizados
Build, health/API, fallback HTML, assets, worker, migrations e regressão completa.

## Estado da implementação

**Concluída** (2026-09-23) — ensaio integrado em jogo, com Albion Online aberto, contra as
imagens de produção reais (não `vite dev`, não `npm run preview`).

### Ambiente montado pra este ensaio

Como a implementação (task 13) só tinha sido validada por build/bundle estático, nunca rodando
as imagens de verdade num container, montei um compose só local —
[`backend/docker-compose.production-local.yml`](../../../backend/docker-compose.production-local.yml)
+ [`backend/local-edge-proxy.conf`](../../../backend/local-edge-proxy.conf) — **não** é o
`stack.production.example.yml` (esse continua intocado, é pro Swarm/Traefik real): builda
`profitpro-backend:local` e `profitpro-frontend:local` a partir dos `Dockerfile` reais, sobe
`api` + os 3 workers + `beat` contra o Postgres/Redis/RabbitMQ persistentes do dev
(`backend/docker-compose.yml`, mesmo `.env`), e um nginx fino fazendo `/api` → `api:8000` e
`/` → `frontend:8080` — só reproduzindo localmente o "mesma origem" que o Traefik faz em
produção (stripprefix), sem precisar de TLS/DNS real. O client Go já estava configurado
(`config.yaml`, `PublicIngestBaseUrls: http+token://localhost:8000`) e não precisou de ajuste.

### Achados reais, corrigidos no processo

Rodar as imagens de verdade pela primeira vez (não só o build) achou dois defeitos genuínos:

1. **`HEALTHCHECK` do frontend quebrado** ([frontend/Dockerfile:20](../../../frontend/Dockerfile)) —
   `wget http://localhost:8080/` resolvia `localhost` para `::1` dentro do container; o nginx só
   escuta IPv4, então o healthcheck falhava com "connection refused" mesmo com o site
   funcionando normalmente (o tráfego real do Traefik/edge-proxy nunca passa por essa
   resolução). Corrigido pra `http://127.0.0.1:8080/`.
2. Meu próprio compose de teste esqueceu de sobrescrever o `HEALTHCHECK` padrão da imagem
   (testa a API em `:8000`) nos serviços de worker/beat — corrigido com os mesmos
   `celery inspect ping`/pidfile que o `stack.production.example.yml` já usa por papel.

Com os dois corrigidos, `api`, os 3 workers, `beat`, `frontend` e o proxy de borda ficaram
`healthy` juntos.

### Validação real (com o jogo aberto)

Confirmada pelo usuário e, independentemente, pelos logs de acesso do proxy de borda (que
mostram a sessão real do navegador, IP do host, batendo com o relato): **Meus Crafts**,
**Calculadora** (craft de "Poção Infernal Maior T8", quantidade 19, qualidade 1, com busca de
item, catálogo, `prices/snapshot` e `prices/sales` todos respondendo `200`) e o toggle de
**Premium** foram exercitados de ponta a ponta contra a API real, com o client Go coletando do
jogo — sem os problemas que a Fase 3 original tinha (nenhuma tela em branco, nenhum
travamento). O usuário classificou o resultado geral como funcionando corretamente.

Adicionalmente, testei sozinho a **recuperação de indisponibilidade** no nível de
infraestrutura (não exigia login): derrubei `api` e `worker-ingest` de propósito
(`docker stop`), confirmei que as requisições falham (timeout/connection refused) durante a
queda, subi os dois de novo e confirmei `/health` voltando a `200` e o healthcheck do Docker
voltando a `healthy`. Meu proxy de borda (nginx simplificado, sem resolver dinâmico) ficou com
o IP antigo do container `api` em cache por alguns segundos até eu reiniciá-lo — isso é uma
limitação do meu substituto local, não do produto: o Traefik real usa o provider Docker com
descoberta de serviço dinâmica e não sofre desse problema.

### Desvios da spec / achado fora de escopo

- **Achado E11 (task 3.6/11, "Retry real e erro visível") continua real, mas fora do escopo
  desta task.** `ScannerPage.tsx:654-657` mostra `<EstadoErro>` sem `onRetry` quando o
  catálogo/preços não carregam na primeira vez — sem F5, não há saída (a atualização de preço
  já em tela, via polling de 30s, se autocura; a carga inicial do catálogo, não). A task 11 não
  está na lista "segue valendo" da Fase 3.6 ([`docs/tasks/correcoes/README.md:6`](../correcoes/README.md))
  — decisão de escopo já tomada antes desta sessão, não revertida aqui. Registro só pra quem
  for revisitar esse achado depois.
- Não recriei o dataset semeado com o fix da task 17 (W11, `mount`/`furnitureitem`) — o
  manifesto (`datasets/albion-static-2026-08-23.json`) tem contagem esperada fixa (8.548
  receitas) e falharia contra o código novo (8.855). Fora de escopo desta task; fica registrado
  aqui também porque afeta qualquer ensaio futuro com este mesmo ambiente.

### Testes automatizados
Não se aplica a este fechamento — a suíte automatizada (build, health/API, fallback HTML,
assets, worker, migrations, regressão completa) já tinha sido coberta pela task 13. Esta task
era exclusivamente o ensaio manual.

### Pendente pra você testar
Nada pendente do checklist original desta task — coleta, Market Flip, refino, craft, taxas,
retorno, Premium e recuperação de indisponibilidade foram todos cobertos (parte por você, parte
por mim na camada de infraestrutura). Se quiser, o ambiente local segue de pé em
`http://localhost:8080` pra qualquer teste adicional; avise se quiser que eu derrube
(`docker compose -f docker-compose.yml -f docker-compose.production-local.yml down`).
