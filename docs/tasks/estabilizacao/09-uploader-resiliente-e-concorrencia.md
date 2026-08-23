# 09 — Uploader resiliente e concorrência segura no client

> Corrige `R09` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Entregar lotes com retry limitado sem criar uma goroutine/`Transport` por operação e remover data
races do estado compartilhado que afetam localização, realm e correlação do histórico.

## Por que

Falha HTTP apenas loga e abandona o lote. `Router.run` chama todo `Process` em goroutine sem limite,
enquanto várias operações leem/escrevem o mesmo `albionState`. `createUploaders` ainda reconstrói
clientes/transports a cada mensagem, desperdiçando pooling.

## O que implementar

1. Criar uploaders uma vez no ciclo de vida do client e reutilizar um `http.Client`/`Transport`
   configurado. Fechar idle connections no shutdown.
2. Introduzir fila limitada por destino com workers em quantidade explícita; definir política de
   backpressure e contadores de fila/drop. Nunca bloquear indefinidamente a captura de pacotes.
3. Retry apenas para rede, 408, 429 e 5xx, respeitando `Retry-After`, exponential backoff com jitter
   e teto. 4xx de contrato/token não entra em loop.
4. Para sobreviver a restart/offline, avaliar e escolher spool durável limitado usando solução Go
   estabelecida ou arquivos atômicos simples e auditáveis. Não persistir token; criptografar ou
   evitar qualquer dado pessoal. Registrar racional se spool for conscientemente adiado.
5. Serializar mutações de `albionState` no router ou proteger estado com mecanismo claro. Não
   adicionar mutex pontual só ao aviso: localização, realm, `WaitingForMarketData` e
   `marketHistoryIDLookup` precisam de política única.
6. Adicionar shutdown gracioso com prazo: parar entrada, drenar fila até o limite e fechar recursos.
7. Logs mostram tentativa, destino sem credencial, tópico, realm, fila e resultado; token nunca.
8. Preservar CRLF/patches locais e limitar o diff contra upstream.

## Depende de

Tasks 02 e 03 (release controlada e realm no uploader).

## Testes automatizados

- Um `Transport` é reutilizado em múltiplos envios; conexões são fechadas no shutdown.
- 500/429/timeout fazem retry; 400/401 não; `Retry-After` é respeitado.
- Fila nunca excede capacidade e a política de saturação é determinística.
- Ordem/correlação de histórico não se perde sob concorrência.
- Executar `go test ./...`; preparar CI com `go test -race` em ambiente CGO compatível.

## Testes manuais

1. Derrubar backend, abrir mercado, restaurar e confirmar entrega/retry sem tempestade.
2. Limitar/atrasar respostas e observar memória, goroutines e fila.
3. Encerrar/reabrir o client com itens pendentes se houver spool.

## Só o humano pode validar

UX de notificações e comportamento com jogo/Npcap real durante indisponibilidade.

