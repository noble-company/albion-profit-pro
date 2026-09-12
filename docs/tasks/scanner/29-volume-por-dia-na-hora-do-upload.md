# 29 — Volume por dia na hora do upload

## Objetivo

O jogador abre o histórico de um item no jogo, volta para a aba do navegador e o "…/dia" daquela
linha **já mostra o dado do client** — em segundos, não em até 2 horas.

## Por que

Achado `W11`, medido em 2026-09-12 com o client ao vivo. O client capturava e gravava o histórico
certo, e a tela não mudava. Entre o banco e a tela havia dois atrasos em série:

1. **O rollup diário é de hora em hora** (`crontab(minute=0)`, `src/celery_app.py`). `GET
   /prices/sales` lê só `market_history_daily`, e bloco novo em `market_history_entry` espera o
   próximo minuto zero. Das séries que o client mandou entre 02:35 e 03:02 UTC, as que chegaram
   **antes** do rollup das 03:00 batiam em **836/836** dias; as que chegaram **depois**
   divergiam em **84/110** (T6_MAIN_CURSEDSTAFF_UNDEAD no Black Market, 10/09: 74 no bruto, 37 no
   diário — o valor da API pública que o client já tinha sobrescrito). Rodando o rollup na mão,
   0 divergências.
2. **O frontend segura a resposta por 1 hora e ignora o foco** (`staleTime` de 1 h,
   `refetchOnWindowFocus: false`, `useSalesVolume.ts`). Mesmo com o diário certo, a aba aberta
   continua com o número velho até um F5.

Somados, até ~2 h. E o rollup de hora em hora não é o lugar de resolver: ele reconstrói 90 dias a
partir de ~2,3 milhões de blocos e já leva **~80 s** (a task 23 previa esse gargalo).

## O que implementar

### Backend — recalcular o diário da série no ingest

1. **Um só lugar para a fórmula do diário.** Extrair de `src/prices/tasks.py` para
   `src/prices/rollup.py` (sem Celery, importável pelo ingest) os limites da janela
   (`_daily_repair_bounds` e auxiliares) e o `INSERT ... SELECT ... GROUP BY ... ON CONFLICT DO
   UPDATE` do diário, parametrizado pelo recorte. `_rollup_diario` passa a usar essa função; os
   nomes seguem importáveis de `src.prices.tasks`.
2. **`save_market_history`**, na **mesma transação** que grava os blocos: se o payload é de 6 h,
   recalcular o diário **só da série** (`server_id`, `item_id`, `location_id`, `quality_level`)
   **só nos dias que o payload tocou**, e só nos dias que o rollup também reconstruiria (dia UTC
   completo, dentro da retenção). A soma relê todos os blocos do dia — do client e da API pública
   —, então o valor é o mesmo que o rollup completo daria.
   - Bloco de 1 h não entra (o rollup também não os soma).
   - O dia de hoje não entra (a média da tela é de dias completos).
   - O mensal fica com o rollup de hora em hora.
3. **Sem esperar o rollup e sem deadlock.** O rollup completo apaga e reinsere a janela inteira
   numa transação de ~80 s; um upsert do ingest nas mesmas linhas esperaria por ela ou entraria em
   deadlock. Um advisory lock separa os dois:
   - `_rollup_diario` toma `pg_advisory_xact_lock` **exclusivo** antes do `DELETE`.
   - O ingest tenta `pg_try_advisory_xact_lock_shared` **no início** da transação. Conseguiu: o
     rollup só começa depois do commit dele, e enxerga os blocos. Não conseguiu (rollup rodando ou
     na fila do lock): grava os blocos, **pula** o recálculo e registra log. O ingest nunca espera.
   - **Limite aceito:** upload que cai nessa janela de ~80 s por hora espera o próximo rollup.

### Frontend — buscar de novo quando a aba volta ao foco

4. `useSalesVolume` passa a usar a política `demand` de `src/api/query.ts` (60 s de `staleTime`,
   `refetchOnWindowFocus: true`), no lugar de 1 h sem foco. Voltar do jogo para o navegador é o
   gatilho natural. Sem `refetchInterval`: o dado não muda sozinho a cada 30 s. A resposta por
   categoria tem poucos KB (Refino › Tecido: 0,8 KB; o realm inteiro, 35,8 KB com gzip).

## Depende de

Task **23** (histórico e `GET /prices/sales`) e **28** (dataset que coloca o histórico do client
no item certo).

## Testes automatizados

Backend (`tests/ingest/test_market_history_daily_on_ingest.py`), guards vermelhos primeiro:

- Upload de 6 h em dias completos atualiza `market_history_daily` da série com a soma de **todos**
  os blocos do dia (inclusive de outra fonte), igual ao que `_rollup_diario` produziria.
- Bloco de hoje não gera linha diária; bloco de 1 h não gera linha diária; dia fora da retenção
  também não.
- Outras séries (outro item, cidade, qualidade ou servidor) não são tocadas.
- Com o lock do rollup tomado por outra conexão, `save_market_history` **não bloqueia**: grava os
  blocos e não mexe no diário.
- Os testes existentes de rollup (`tests/prices/test_rollup*.py`, `test_aodp_history.py`) seguem
  verdes.

Frontend (`src/scanner/useSalesVolume.test.tsx`):

- Com o dado velho (passado o `staleTime`), o foco da janela dispara nova requisição e o volume
  novo aparece.
- Dentro do `staleTime`, o foco não dispara requisição.

## Testes manuais

1. Com a stack e o client no ar, abrir no jogo o histórico de um item numa cidade (aba de semanas).
2. Logo depois, no banco: o `market_history_daily` da série bate com a soma dos blocos dos dias
   completos (a mesma consulta usada no achado).
3. Voltar para a aba do scanner, na categoria do item: o "…/dia" da linha muda sem F5, se o dado
   do client for diferente do que já havia.

## Estado da implementação

**Concluída.** Backend `pytest tests` **460 passaram**, 1 pulado, 1 falha que já existia
(`test_compare_query_count_does_not_grow_with_city_count`) · `ruff check` e `ruff format` limpos.
Frontend `npm run test` **514/514** · `typecheck` limpo · `lint` 0 erros (7 avisos, os mesmos).

Guards vermelhos primeiro: no backend o arquivo inteiro (sem `src.prices.rollup`); no frontend o
teste do dado velho (a tela continuava com "10" depois do foco).

### O que só apareceu implementando

- **`test_module_boundaries` proíbe importar nome privado de outro módulo.** Com a fórmula em
  `rollup.py`, `utc_now` e `daily_repair_bounds` viraram públicos; `tasks.py` importa de lá.
- **`auth.test.tsx` é instável com as suítes do backend e do frontend rodando juntas** (espera de
  tela estourando sob carga). Passa sozinho e na suíte do frontend isolada. Não é desta task.

### Validado ao vivo (2026-09-12)

Com API, workers, beat e client reiniciados no código desta task, o jogador abriu o histórico de
um item no jogo, voltou para a aba do scanner e o "…/dia" atualizou sem F5.
