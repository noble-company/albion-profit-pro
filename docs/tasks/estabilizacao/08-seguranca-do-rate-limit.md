# 08 — Segurança do rate limit

> Corrige `R08` e o achado aberto `F7`.

## Objetivo

Eliminar segredo cru das chaves Redis e impedir que um cliente escolha livremente o IP usado no
rate limit de autenticação.

## Por que

`identificar_por_token` devolve `Authorization` inteiro, armazenando o token funcional por até
60s. `identificar_por_ip` aceita o primeiro `X-Forwarded-For` sem provar que a requisição veio de
proxy confiável, permitindo trocar de identidade por request.

## O que implementar

1. Derivar identificador do token com hash estável e domínio separado (`sha256`/HMAC); nunca incluir
   `Bearer` ou valor cru. Reutilizar função compartilhada sem criar dependência circular.
2. Preferir o ID do `ApiToken` validado quando a ordem das dependencies permitir; requisições sem
   token válido usam hash não reversível apenas para limitar tentativas, sem consultar segredo em
   log/Redis.
3. Definir proxies confiáveis via configuração. Só honrar forwarded headers quando o peer imediato
   estiver nessa lista/rede; caso contrário usar `request.client.host`.
4. Confirmar como Traefik sanitiza/encadeia `X-Forwarded-For` no stack real antes de fechar a task.
5. Tornar `INCR` + expiração atômicos (Lua/pipeline transacional ou primitive consolidada) para não
   deixar chave sem TTL se o processo cair entre comandos.
6. Definir comportamento quando Redis cai: segurança e disponibilidade devem ser decisão explícita
   por rota, com log/métrica; não acontecer acidentalmente.

## Depende de

Task 01. Pode avançar em paralelo às correções de dados.

## Testes automatizados

- Nenhuma chave Redis contém token cru ou sufixo suficiente para reconstrução.
- Dois tokens têm buckets diferentes; mesmo token compartilha limite entre réplicas simuladas.
- `X-Forwarded-For` forjado de peer não confiável é ignorado.
- Proxy confiável extrai o cliente conforme política definida.
- Toda chave criada tem TTL mesmo sob concorrência.

## Testes manuais

Inspecionar `SCAN rl:*` no Redis e testar requests via Traefik real, não apenas diretamente no
Uvicorn.

