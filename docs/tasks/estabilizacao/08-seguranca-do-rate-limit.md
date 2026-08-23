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

## Estado da implementação — 2026-08-23

**Concluída.** Código, validação automatizada e verificação operacional no Traefik real foram
confirmados em 2026-08-23.

- Tokens válidos usam `ApiToken.id` nas chaves; token ausente/inválido usa HMAC-SHA-256 com domínio
  versionado. `Authorization`, token cru, hash persistido e sufixo do segredo não são armazenados.
- `TRUSTED_PROXY_CIDRS` aceita somente IPs/CIDRs explícitos e rejeita `0.0.0.0/0`/`::/0`. Peer fora
  dessas redes não pode influenciar a identidade com `X-Forwarded-For`.
- Para peer confiável, a cadeia é lida da direita para a esquerda, ignorando proxies conhecidos e
  selecionando o primeiro hop não confiável. Cadeia malformada cai para o peer imediato.
- O Uvicorn da imagem usa `--no-proxy-headers`: a aplicação precisa enxergar o peer imediato antes
  de decidir se confia no header. Isso evita que duas camadas apliquem políticas divergentes.
- O contador executa `INCR` e o primeiro `EXPIRE` em um script Lua atômico, conforme o padrão de
  rate limiter documentado pelo [Redis](https://redis.io/docs/latest/commands/incr/).
- Redis indisponível é **fail-closed** (`503`) em login/registro e **fail-open** após autenticação
  dos endpoints do client/ingest. Ambos os caminhos geram log estruturado sem identidade secreta.
- A fixture HTTP usa um peer IPv6 real sintético, em vez de forjar `X-Forwarded-For`.
- Validação: `205 passed`; `ruff check` e `ruff format --check` verdes.

### Validação operacional

O proprietário confirmou a conclusão do ensaio no ambiente Traefik em 2026-08-23. Como redes,
secrets e o stack real não são versionados neste repositório, os valores permanecem externos. O
procedimento reproduzível é:

1. obter o subnet/IP real da rede entre Traefik e backend e configurar
   `TRUSTED_PROXY_CIDRS=["<cidr-exato>"]` no serviço da API;
2. confirmar que o entrypoint do Traefik não usa `forwardedHeaders.insecure` e documentar qualquer
   upstream adicional em `forwardedHeaders.trustedIPs`; a opção insegura é desaconselhada pela
   [documentação oficial](https://doc.traefik.io/traefik/master/reference/install-configuration/entrypoints/);
3. enviar requests diretos e via Traefik, incluindo `X-Forwarded-For` forjado, e conferir a
   identidade escolhida em `SCAN rl:*` sem encontrar token ou `Bearer`;
4. confirmar TTL positivo em todas as chaves observadas.

Esse procedimento volta a integrar o gate operacional completo da Task 14; alterações futuras de
rede ou entrypoint exigem repeti-lo.
