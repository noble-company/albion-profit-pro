# 10 — Validação ponta a ponta em jogo

## Objetivo
Rodar o pipeline completo — `jogo → client → nosso backend → Postgres` — com o jogo aberto e dado
real, e fechar a Fase 2.

## Por que

Todas as tasks anteriores são verificáveis isoladamente, e nenhuma delas prova o que importa. O
backend inteiro (Fase 1 + 1.5, 36 tasks; suíte hoje com 131 testes) foi construído e validado **sem nunca ter
recebido um byte do client Go de verdade** — o item 2 da seção "Verificação" do
[plano macro](../../00-plano-macro.md) está aberto desde o começo do projeto, justamente porque o
client não tinha como autenticar.

A Fase 1.5 existiu porque a Fase 1 foi construída contra payloads inventados e três propriedades
semânticas do dado real passaram despercebidas por 51 testes verdes. A lição foi cara: **teste
verde não é o mesmo que sistema funcionando**. Esta task é a checagem de realidade correspondente
pra Fase 2.

> **Esta task só um humano consegue executar.** Exige o Albion Online aberto, um personagem
> logado, e ações dentro do jogo. Nenhuma parte dela é automatizável, e a skill
> `/implementar-task` deve reportá-la inteira como pendente de verificação humana.

## O que validar

### Preparação

```bash
# 1) infra local
cd backend
docker compose up -d

# 2) migrations + API
uv run alembic upgrade head
uv run uvicorn src.main:app --reload

# 3) worker, noutro terminal
uv run celery -A src.celery_app.celery_app worker --loglevel=info
```

Criar usuário e token: `POST /auth/register` → `POST /auth/login` → `POST /auth/tokens`. Colar o
token no `config.yaml` do client (ao lado do binário — ver task 01), não na linha de comando.

**Antes de abrir o jogo**, confirmar que o token presta:

```bash
curl -H "Authorization: Bearer apk_..." http://localhost:8000/client/me
```

Isso separa "token errado" de "client não coletando", que é o ponto da task 04.

### Roteiro no jogo

Na ordem — a ordem importa por causa do achado `N6`:

1. Subir o client **antes** de entrar no jogo (ou pelo menos antes de trocar de zona).
2. **Atravessar uma passagem de zona.** Sem isso, `IsValidLocation()` é falso e o client descarta
   tudo em silêncio (doc 01 §9.1). Confirmar no log a linha `Updating player location to ...`.
3. Abrir o mercado de uma cidade e consultar um item conhecido (T2_FIBER é o item de referência das
   capturas anteriores).
4. Conferir no Postgres:
   ```sql
   SELECT item_id, location_id, auction_type, unit_price_silver, amount, last_seen_at
   FROM market_order ORDER BY last_seen_at DESC LIMIT 20;
   ```
5. Consultar o histórico do mesmo item in-game (o gráfico de preço) e conferir
   `market_history_entry`.
6. Ler os preços pela API: `GET /items/T2_FIBER/prices?scope=mine` com o JWT do usuário → o dado
   coletado aparece, e `scope=mine` reflete a cobertura real (task 30 do backend).

> ~~Refinar/craftar e conferir tabela de craft~~ — removido: tasks 07-09 foram descopadas em
> 2026-08-23 (ver [tasks/client/README.md](README.md#por-que-07-09-foram-descopadas-2026-08-23)).
> Não há tabela de craft a verificar.

### O que conferir além de "chegou"

Chegar não basta — a Fase 1.5 inteira existiu porque o dado chegava **errado**:

| Verificação | Por que |
|---|---|
| `unit_price_silver` bate com o preço na tela do jogo | Achado `N1` — prata vem ×10.000 do fio; se aparecer 370000 no banco em vez de 37, a normalização da task 25 não está sendo aplicada |
| `location_id` corresponde à cidade onde você está | Achado `N3` — `LocationId` nem sempre é numérico (`1000-HellDen`, `3005@1`) |
| Reabrir o mercado não duplica linhas | Achado `C2` — o client reenvia o livro inteiro a cada varredura; medido em 2,0× (194 ordens para 97 leilões reais) |
| `bucket_start` do histórico bate com o horário real | Achado `N4` — timestamps são ticks .NET, não epoch Unix |
| O worker sobrevive à sessão inteira | Achado `C1` — antes da task 23 a 2ª chamada travava indefinidamente |
| Nenhum `Got bad response code` no log do client | Achados `F5` (404 dos tópicos órfãos) e auth |
| `grep -i apk_ albiondata-client.log` vazio | Task 01 — token nunca pode vazar pro arquivo de log |

### Sinais de que algo está errado

Os dois modos de falha silenciosa desta fase produzem **o mesmo sintoma** ("não aparece nada"), e
distingui-los é exatamente o que as tasks 04 e 05 existiram pra permitir:

- Log do client com `The players location has not yet been set` → não atravessou zona (`N6`).
- Log do client com `Got bad response code: 401` → token errado/revogado.
- Nada nos dois, mas banco vazio → o dado está parando na fila. Conferir o worker e o RabbitMQ.

## Bibliotecas/dependências
Nenhuma. Task de verificação.

## Depende de
Tasks 01-06 (07-09 foram descopadas, ver [README.md](README.md)). O roteiro abaixo cobre só o
pipeline de mercado — o único que existe.

## Entregáveis

1. **`docs/00-plano-macro.md`** — marcar o item 2 da seção "Verificação" como ✅, com a data e o que
   foi confirmado. É o item que está aberto desde o início do projeto.
2. **`docs/tasks/client/README.md`** — checklist da Fase 2 fechado.
3. **`CLAUDE.md`** — atualizar a tabela de status do `albiondata-client/` (que a task 03 já corrigiu
   quanto ao `N5`) pra refletir a Fase 2 concluída.
4. **Qualquer achado novo** vai pro doc certo conforme a convenção do `docs/README.md`: sobre o
   funcionamento do client → doc 01; medido no jogo → doc 03; sobre o nosso código → doc 04 e vira
   task.
5. **Fixtures reais** em `backend/tests/fixtures/wire/` se a sessão produzir payload novo — é a
   moeda mais valiosa que uma sessão em jogo gera.

## Testes manuais
A task inteira. Roteiro acima.

## Testes automatizados
Nenhum novo. Confirmar que os existentes continuam verdes depois de tudo:

```bash
cd backend && uv run pytest tests/ -v && uv run ruff check .
cd ../albiondata-client && go build ./... && go test ./...
```
