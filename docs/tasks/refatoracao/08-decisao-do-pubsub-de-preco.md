# 08 — Decisão do pub/sub de preço

> Corrige `B10`.

## Objetivo

Resolver uma promessa pela metade: ou entregar o push de preço em tempo real, ou parar de pagar
o custo dele no caminho quente do ingest.

## Por que

`recompute_and_cache_book` chama `publish_price_update()` para **cada combinação** de cada lote
de ingest. O `docstring` de `cache/redis_client.py` diz: "o frontend com WebSocket aberto assina
`prices:<item_id>` e recebe em tempo real". O plano macro promete o mesmo.

Só que **não existe nenhum endpoint WebSocket ou SSE no backend** — `grep` por `websocket` em
`src/` retorna apenas esse comentário. O frontend faz polling a cada 30 s. Ou seja: publicamos
mensagens que ninguém consome, no caminho mais quente do sistema, e ainda assim a UI é polling.

## O que implementar

Escolher **uma** das duas saídas e executá-la por inteiro. A decisão é de produto e deve ser
registrada nesta task.

### Opção A — entregar o push

1. Endpoint SSE ou WebSocket autenticado que assina `prices:<realm>:<item_id>` no Redis.
2. Autenticação e autorização no handshake, e limite de assinaturas por conexão.
3. Encerramento limpo de conexão, backpressure e comportamento definido quando o Redis cai.
4. Integração no frontend via TanStack Query (`setQueryData` a partir do evento), substituindo
   o `setInterval` de 30 s da task 15.
5. Decidir o que acontece com abas em segundo plano.

### Opção B — remover o custo

1. Retirar `publish_price_update` de `recompute_and_cache_book`.
2. Remover a função e o canal, ou mantê-los documentados como não usados, sem chamada no
   caminho quente.
3. Corrigir o `docstring` de `cache/redis_client.py` e a promessa no plano macro, para que a
   documentação pare de descrever uma funcionalidade inexistente.
4. Manter o polling da task 15, agora com intervalo e visibilidade corretos.

**Recomendação:** Opção B agora, Opção A quando houver usuários suficientes para justificá-la.
O polling com cache e visibilidade da task 15 já resolve a percepção de "dado atualizado", e o
push adiciona uma superfície de conexão persistente que ainda não precisa existir.

## Depende de

Task 01. Se escolhida a Opção A, depende também da task 15.

## Testes automatizados

- **Opção A:** um ingest gera evento recebido pelo cliente conectado; conexão sem credencial é
  recusada; queda do Redis não derruba a API.
- **Opção B:** nenhum `PUBLISH` é emitido durante um ingest; a suíte de ingest segue verde e o
  tempo do caminho quente não regride.

## Testes manuais

**Opção A:** abrir a tela de preços e confirmar atualização sem recarregar, com o client Go
coletando ao vivo. **Opção B:** conferir com `MONITOR` no Redis que o ingest não publica mais.

## Estado da implementação

Concluída em 2026-08-31. **Decisão: Opção B** (remover o custo), conforme a recomendação da spec.

Motivo: não existia nenhum endpoint WebSocket/SSE, nem assinante — `publish_price_update` era
custo puro no caminho mais quente do sistema (uma chamada por combinação, por lote de ingest),
e a UI continuava sendo polling. O polling com cache e visibilidade (task 15) já cobre a
percepção de "dado atualizado". O push volta como implementação nova quando o volume de
usuários justificar uma conexão persistente.

### O que foi feito

1. `publish_price_update` **removido** de `recompute_and_cache_book` (`prices/service.py`) e do
   import.
2. A função `publish_price_update` foi **apagada** de `cache/redis_client.py` — código morto com
   docstring enganosa é pior que ausência. Substituída por um comentário explicando a decisão.
3. `docs/00-plano-macro.md` corrigido nos 4 pontos que prometiam "pub/sub → WebSocket alimentado
   pelo Redis, em vez de polling".
4. Polling da task 15 mantido (o frontend já faz; intervalo/visibilidade corretos ficam com a
   task 15).

### Testes

- `tests/ingest/test_tasks.py::test_ingest_does_not_publish_to_redis_pubsub` (novo): faz espião
  em `Redis.publish` e roda `save_market_orders` — **nenhum PUBLISH** é emitido.
- `tests/test_redis_client.py`: teste do `publish_price_update` removido junto com a função.
- `uv run pytest tests/ -q` → **333 passed**. `uv run ruff check .` → limpo. O caminho quente do
  ingest não regride (uma chamada de rede a menos por combinação).

### Nota para a task 28

`docs/tasks/frontend/20.6` ("Invalidação de cache e pub/sub") e a linha de `20.3` que menciona
"a atualização por pub/sub da Task 20.6" foram deixadas como estão — as tasks 20.4-20.11 estão
adiadas e a task 28 vai revalidá-las contra esta decisão (não haverá pub/sub; a invalidação de
cache pós-ingest, se precisar, é outra coisa).
