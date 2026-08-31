# 10 — Antifraude de mercado

> Corrige `S01`. **ADIADA por decisão de produto em 2026-08-30.**

## Status

> ⚠️ Esta task **não deve ser implementada agora**. Ela fica escrita, aberta e priorizada como
> **pré-requisito de lançamento público**. Enquanto a base de usuários for pequena e conhecida,
> o risco é aceito de forma explícita e consciente.
>
> Duas medidas baratas saem daqui e entram já, porque também servem a outros fins:
> registrar `api_token_id` na procedência (item 1 abaixo) e o rate limit da task 06.

## Objetivo

Impedir que um usuário — hostil ou apenas com um client defeituoso — corrompa o preço que toda
a plataforma enxerga, e permitir desfazer a contribuição de uma fonte específica.

## Por que

O registro é aberto e não há verificação de e-mail: `current_active_user` exige `is_active`, não
`is_verified`, e o frontend registra com `is_verified: false`. Qualquer pessoa cria conta, chama
`POST /auth/tokens` e passa a poder postar em `/marketorders.ingest`.

As tabelas-fato `market_order` e `market_history_entry` são **globais e sem dono** — decisão
correta para agregação, mas que significa que uma ordem forjada entra no acervo de todos. A
tabela `market_scan` registra que um usuário varreu uma combinação, mas **não** amarra a linha do
fato a quem a enviou. Não há detecção de outlier, reputação por fonte, quarentena por suspeita
nem forma de reverter.

O dado de mercado é o produto inteiro. Se ele for envenenado, todo o resto — o motor de craft, o
ranking, a calculadora — produz números errados com aparência de certeza.

## O que implementar

1. **(Entra já)** Registrar `api_token_id` além de `user_id` na procedência, para que a
   contribuição de um token específico possa ser identificada e invalidada depois. Hoje
   `api_token_id` chega até a task Celery e é descartado.
2. Exigir e-mail verificado antes de emitir token de ingest — decidir o provedor de envio e o
   fluxo de reenvio. `fastapi-users` já traz o esqueleto de verificação.
3. Rejeição de outlier no ingest: preço absurdamente fora da distribuição recente da mesma
   combinação vai para quarentena em vez de entrar na tabela-fato. Reutilizar a infraestrutura
   de quarentena já existente (`src/quarantine/`).
4. Reputação por token: divergência sistemática em relação ao consenso reduz o peso da fonte;
   definir se o peso afeta agregação ou apenas alerta.
5. Capacidade operacional de invalidar tudo que um token enviou, com auditoria.
6. Documentar o modelo de ameaça e o que ele **não** cobre.

## Depende de

Tasks 01 e 06. O item 1 pode ser feito imediatamente e de forma isolada.

## Testes automatizados

- Usuário sem e-mail verificado não consegue emitir token de ingest.
- Ordem com preço fora do intervalo aceitável vai para quarentena e não altera o livro.
- Invalidar um token remove a contribuição dele sem afetar a de outros usuários.
- A procedência registra `api_token_id` e permite rastrear a origem de uma linha.

## Testes manuais

Simular um coletor hostil com token válido postando preços forjados e confirmar que o livro
público não se move.
