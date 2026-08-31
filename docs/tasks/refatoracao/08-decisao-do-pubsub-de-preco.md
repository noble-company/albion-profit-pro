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
