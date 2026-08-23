# 13 — Validação no boot e configuração de produção

> Corrige `R13` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Validar destino, token e realm antes de começar a captura e impedir que uma release de produção
saia silenciosamente apontando para `localhost`.

## Por que

O backend oferece `GET /client/me`, mas o client nunca chama. Token inválido só aparece quando o
jogador abre o mercado. O default hardcoded de dev é aceitável para teste local, não para binário
distribuído.

## O que implementar

1. Separar configuração de desenvolvimento e release. Release sem URL oficial/config explícita
   inicia com upload desabilitado e aviso acionável; nunca tenta `localhost` silenciosamente.
2. Derivar endpoint base de forma segura do destino `http(s)+token://`; validar apenas destinos
   autenticados do Profit Pro.
3. No boot e após alteração de configuração, chamar `/client/me` com timeout curto e realm quando
   requerido. Não bloquear UI indefinidamente.
4. Estados distintos e visíveis em log/systray: configurando, autenticando, pronto, token ausente,
   401/revogado, realm desconhecido, backend indisponível e destino inválido.
5. Só liberar uploads após configuração válida. Para indisponibilidade transitória, integrar com a
   fila/retry da task 09; 401 pausa e pede ação, não faz retry infinito.
6. Nunca logar URL com userinfo/query sensível, header ou token. Sufixo permitido apenas onde já
   adotado.
7. Atualizar `config.yaml.example` com URL/token, precedência, realm automático e troubleshooting.

## Depende de

Tasks 02, 03 e 09.

## Testes automatizados

- Release sem URL não envia para localhost.
- Token válido → estado pronto; ausente/401/revogado → upload bloqueado e estado correto.
- 5xx/timeout entra em recuperação transitória sem vazar goroutine/token.
- URL `+token` é normalizada sem substituir texto fora do esquema.
- Logs capturados nunca contêm token cru.

## Testes manuais

Testar boot com cada estado no Windows/systray e confirmar que o usuário entende o que corrigir sem
abrir arquivo de log.

## Só o humano pode validar

URL oficial de produção e qualidade/clareza da UX no sistema operacional.

