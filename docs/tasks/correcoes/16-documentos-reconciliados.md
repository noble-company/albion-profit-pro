# 16 — Documentos reconciliados com a Fase 3.5

> Corrige `E09` e `P06`.

## Objetivo

Fazer as specs pararem de descrever comportamento que a própria Fase 3.5 removeu, e o documento
parar de prometer uma fronteira de cotação mais estreita do que a que o código tem.

## Por que

O sistema de documentação é o que este projeto usa no lugar de memória. Quando um documento
autoritativo descreve algo revogado, quem seguir a spec reconstrói o defeito — que é exatamente
o padrão `A02`/`R14` já registrado duas vezes.

**Contrato em português no doc que tem precedência declarada.**
`docs/03-contrato-ingest-real.md:434-437` ainda descreve a API com `melhor_preco`,
`unidades_observadas`, `ordens_observadas`, `observado_em`, `idade_segundos`, `cobertura` e
`janela_frescor_segundos`. Tudo isso foi renomeado pela task 3.5/07 (`B09`). E
`docs/README.md:10` declara que o doc 03 "tem precedência sobre qualquer suposição anterior" —
é o pior lugar possível para um contrato revogado.

**O achado `B02` descrito como implementação atual.**
`docs/tasks/frontend/15-motor-oportunidades.md:31-33`, sob o título "Implementação atual
(2026-08-23)":

> O ranking limita candidatos a 200 receitas por chamada

Isso é literalmente o `B02` (`docs/12-revisao-fase-3.md:35`), removido pela task 3.5/03. As tasks
backend 29/31 e a frontend 20 receberam nota de reconciliação; esta não.
`docs/tasks/frontend/16-dashboard-market-flip.md:22-40` tem o mesmo problema em menor grau
(descreve estados e ordenação anteriores a `F03`/`F08`).

**Pub/sub removido, mas ainda prescrito.** A task 3.5/08 corrigiu só o `00-plano-macro.md`.
Sobraram: `docs/tasks/backend/14-modulo-redis.md` com o título "Módulo Redis (cache + pub/sub)",
mandando implementar `publish_price_update` e descrevendo "o frontend com WebSocket aberto assina
`prices:<item_id>`" — sem nenhuma nota de supersedência, ao contrário das tasks 17 e 18, que
levam `⚠️ revisada` no README; `docs/tasks/backend/17-tasks-celery-gravacao.md:33,82` com código
de exemplo chamando uma função apagada; `docs/tasks/estabilizacao/03-realm-ponta-a-ponta.md:32`
("canais pub/sub"); `docs/tasks/frontend/20.3-projecao-ultima-observacao.md:34` (referência à
20.6, que foi superada).

**Fronteira de cotação prometida mais forte do que é (`P06`).** `CLAUDE.md:14` e a revisão da
Fase 3 falam em "single quote frontier (`src/craft/quotes.py`)". É verdade para craft e refino —
`quotes.py` é importado só por `craft/service.py` e `craft/compare_service.py`, e o ranking passa
por `simulate_craft`. Mas existem **três** motores lendo `MarketOrder` com semânticas diferentes:

| Motor | Onde | Semântica |
|---|---|---|
| `quotes.py` | `src/craft/quotes.py` | caminha a profundidade do livro, emite `INSUFFICIENT_DEPTH` |
| Flip | `src/opportunities/service.py:88-178` | top-of-book em SQL, `least(offers.amount, requests.amount)` de uma ordem |
| Preços | `src/prices/service.py:293-344` | `min(unit_price)` para `sell`, `max` para `buy` |

A divergência é **deliberada** (`price_model="top_of_book"`, `src/opportunities/schemas.py:65-70`,
decidido na task 3.5/02). O que falta é o documento dizer isso, em vez de sugerir uma fronteira
única.

## O que implementar

1. Nota de reconciliação no topo de `docs/03-contrato-ingest-real.md`, e correção da seção do
   contrato para os nomes em inglês, apontando para a task 3.5/07.
2. Nota de supersedência em `docs/tasks/frontend/15-motor-oportunidades.md` e
   `16-dashboard-market-flip.md`, no mesmo formato das que a 3.5 já deixou.
3. Nota em `docs/tasks/backend/14-modulo-redis.md` e `17-tasks-celery-gravacao.md`; marcador
   `⚠️ revisada` na linha correspondente de `docs/tasks/backend/README.md:70`; ajuste em
   `docs/tasks/estabilizacao/03-realm-ponta-a-ponta.md:32` e
   `docs/tasks/frontend/20.3-projecao-ultima-observacao.md:34`.
4. Documentar os três motores de preço — onde vive cada um, que semântica tem, por que são
   diferentes — e ajustar `CLAUDE.md:14` e `AGENTS.md:14` para descrever a fronteira única como o
   que ela é: única **para craft e refino**.
5. Corrigir o estado congelado em `docs/00-plano-macro.md:110-112` (a árvore de arquitetura ainda
   diz que o client está "ainda vanilla" e que o frontend é "NOVO") e a decisão de `:225`
   ("frontend apenas apresenta"), contradita pela camada "e se" da task 3.5/23.
6. Corrigir a contagem de achados: `docs/12-revisao-fase-3.md:206` e
   `docs/tasks/refatoracao/29-fechamento-documental.md:74` falam de `W1`–`W13`, mas a tabela de
   `docs/tasks/refatoracao/README.md` tem `W1`–`W12`. E incluir `W8` na lista de achados abertos
   de `12-revisao-fase-3.md:208-210` — ele segue aberto (`BOOK_CACHE_VERSION` ainda é `"v2"` em
   `backend/src/cache/redis_client.py:10`) e não aparece lá.
7. Corrigir a referência cruzada de `backend/tests/test_api_language.py:6`, que cita `W1` onde o
   achado do `ApiTokenPublic` é o `W3`.

## Depende de

Tasks 06 e 10 — o contrato final precisa estar decidido antes de o documento descrevê-lo.

## Testes automatizados

- `python scripts/verify_repository.py` verde (links, âncoras e consistência de status).
- Nenhum grep por `melhor_preco`, `unidades_observadas`, `publish_price_update` ou `.limit(200)`
  retorna documento sem nota de supersedência.

## Testes manuais

Ler `docs/03-contrato-ingest-real.md` e `docs/tasks/frontend/15-motor-oportunidades.md` do começo
ao fim como se fosse implementar a partir deles, e confirmar que não levam ao comportamento
revogado.
