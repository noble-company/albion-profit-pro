# 10 — Tokens do client Go

## Objetivo
Permitir criar, listar, copiar e revogar tokens com instruções operacionais corretas.

## Por que
O token cru só aparece na criação. A UI precisa impedir que o usuário presuma que poderá recuperá-lo
depois e explicar a troca de zona necessária para começar a coleta.

## O que implementar
- `TokensPage`, hooks e `ConfigInstrucoes` para GET/POST/DELETE `/auth/tokens`.
- Modal da criação mostra o segredo uma vez, com copiar e confirmação antes de fechar; depois só
  sufixo/nome/datas. Não persistir token cru em storage, cache do Query ou analytics.
- Revogação retorna 204 na primeira chamada e 404 quando já ausente; UI trata ambas como estado final
  revogado sem prometer idempotência inexistente no backend.
- Snippets corretos de `config.yaml` e flag `-token`, aviso de não compartilhar segredo e instrução
  de atravessar zona (`N6`).
- `ultimo_uso_em` é aproximado devido ao throttle de 1 h.

## Bibliotecas/dependências
Clipboard API do navegador, com fallback acessível.

## Depende de
Task 09.

## Testes manuais
Gerar, copiar, configurar o client, observar último uso e revogar.

## Testes automatizados
Segredo uma vez e fora de storage/cache, clipboard, estados vazio/erro, revogação 204/404 e
formatação aproximada.

## Implementação concluída (2026-08-23)

- `TokensPage`, hooks e service conectados ao OpenAPI real em `src/tokens/`.
- O segredo aparece somente no modal de criação, exige cópia antes de fechar e não é gravado em
  storage ou Query cache.
- Revogação trata `204` e `404` como estado final e invalida a listagem.
- Instruções de `config.yaml`, `-token`, aviso de não compartilhar e travessia de zona foram
  incluídas na tela.
- Testes cobrem segredo único, ausência em storage e revogação ausente.
