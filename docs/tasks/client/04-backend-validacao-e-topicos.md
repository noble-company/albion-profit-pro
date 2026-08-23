# 04 — Backend: validação de token e tópicos não usados

> Corrige o achado **F5** de [README.md](README.md).

## Objetivo
Duas adições pequenas no `backend/` que existem por causa do client: um jeito do client conferir
que o token dele presta **antes** de ter dado pra mandar, e rotas que absorvem os três tópicos
públicos que o client publica e nós não usamos.

## Por que

### O client não tem como validar o token (nem o usuário)

Hoje a única forma de descobrir que o token está errado é mandar dado e tomar 401 — e
`httpUploader` trata 401 como mais um `log.Errorf` no arquivo de log
(`client/uploader_http.go:47`). Junte isso ao achado `N6` (o client descarta tudo até uma transição
de zona, ver task 05) e o usuário tem **dois** modos de falha silenciosa diferentes que produzem o
mesmo sintoma: "não aparece nada no site". Sem uma forma de distinguir um do outro, todo suporte
vira adivinhação.

`GET /auth/tokens` (`src/api_tokens/router.py:23`) não serve: ele exige JWT
(`current_active_user`), que o client não tem — o client só tem o token opaco.

### Os três tópicos órfãos (achado F5)

`lib/nats.go` define os tópicos, e o client publica **seis** no canal público:

| Tópico | Nosso backend | Call site no client |
|---|---|---|
| `marketorders.ingest` | ✅ implementado | `operation_auction_get_offers.go:96`, `..._requests.go:46` |
| `markethistories.ingest` | ✅ implementado | `operation_auction_get_item_average_stats.go:125` |
| `goldprices.ingest` | ✅ aceita e descarta | `operation_gold_market_get_average_info.go:31` |
| `mapdata.ingest` | ❌ **404** | `operation_get_cluster_map_info.go:57` |
| `banditevent.ingest` | ❌ **404** | `event_redzone_world_map_event.go:42` |
| `festivities.ingest` | ❌ **404** | `event_festivities_update.go:40` |

Enquanto o `-i` apontava pra comunidade isso não existia. Com o `-i` apontando só pra nós (task 03),
esses três viram `log.Errorf("Got bad response code: 404")` a cada evento — poluindo justamente o
log que o usuário vai mandar quando pedir ajuda, e mascarando erros de verdade.

Absorver no servidor (em vez de filtrar no client) é mais robusto: funciona pra qualquer versão de
client, inclusive as que já estiverem instaladas quando mudarmos de ideia.

## O que implementar

### `GET /client/me`

`src/api_tokens/router.py` já existe com `prefix="/auth/tokens"`. Como esta rota não pertence
àquele prefixo, declarar um segundo router no mesmo arquivo:

```python
client_router = APIRouter(prefix="/client", tags=["client"])


@client_router.get("/me", response_model=ClientIdentity)
async def client_me(token: ApiToken = Depends(require_api_token)):
    """Ping autenticado pro client Go conferir, no boot, que o token dele é válido —
    sem precisar ter dado pra mandar. Sem isso o único sinal de token errado é um 401
    perdido no albiondata-client.log (ver docs/tasks/client/04)."""
```

Registrar em `src/main.py` junto dos outros (`main.py:54-57`).

Schema em `src/api_tokens/schemas.py` — devolver o mínimo que identifica sem expor segredo:

```python
class ClientIdentity(BaseModel):
    user_id: uuid.UUID
    email: EmailStr
    token_sufixo: str   # "a3f9" -- confirma QUAL token, sem revelar o valor
```

`email` é o e-mail do próprio dono do token, então não vaza nada de terceiro. `token_sufixo` já
existe no modelo desde a task 32 do backend, exatamente pra esse tipo de exibição.

Precisa de um `join` pro `user` (o `ApiToken` só tem `user_id`) — ou uma query extra, ou
`selectinload` na relação, o que já estiver mais alinhado com `src/api_tokens/service.py`.

**Rate limit:** o `require_api_token` sozinho não protege contra alguém varrendo tokens. Aplicar o
mesmo `rate_limit` por token que o ingest usa (`src/rate_limit.py`, `identificar_por_token`), com
um limite baixo — é uma rota chamada uma vez por boot de client, não no caminho quente.

### Rotas accept-and-drop

Em `src/ingest/router.py`, pra herdar o rate limit por token já declarado no router
(`src/ingest/router.py:12-17`). Mesmo espírito de `process_gold_prices`
(`src/ingest/tasks.py`), que já responde 200 e loga o descarte de forma estruturada em vez de
sumir com o dado em silêncio (achado `C6` da revisão da Fase 1):

```python
TOPICOS_NAO_CONSUMIDOS = ("mapdata", "banditevent", "festivities")


@router.post("/{topico}.ingest", status_code=200)
async def ingest_topico_nao_consumido(
    topico: str,
    request: Request,
    token: ApiToken = Depends(require_api_token),
):
    """O client publica 6 tópicos públicos; consumimos 3. Sem estas rotas os outros viram
    404 a cada evento e poluem o albiondata-client.log do usuário (achado F5). Aceita,
    registra, não grava."""
```

Dois pontos de atenção:

1. **Ordem de registro.** Starlette casa rota na ordem de registro, e uma rota curinga
   `/{topico}.ingest` capturaria `/marketorders.ingest` se viesse antes. Registrar **depois** das
   três rotas concretas — o mesmo cuidado que `src/main.py:48-53` já documenta pro
   `api_tokens_router` vs `auth_router`. Se a ordem parecer frágil, declarar as três rotas
   explicitamente em vez de usar curinga; é mais verboso e mais seguro.
2. **Não parsear o corpo.** Não vale a pena escrever schema Pydantic pra dado que descartamos. O
   middleware `LimitarTamanhoDoCorpo` (`src/main.py:27-36`) já rejeita acima de 10 MB antes do
   parse, então basta logar `request.headers.get("content-length")` sem ler o corpo.

Um `topico` fora da lista conhecida deve continuar dando 404 — não queremos aceitar qualquer coisa
que apareça, só o que sabemos que o client manda.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Nada do client (é backend puro) — pode ser feita em paralelo com as tasks 01-03. Mas precisa
existir **antes da task 10**, e o `GET /client/me` só vira útil de fato quando o client passar a
chamá-lo no boot.

> **Escopo:** esta task só cria o endpoint. Fazer o client chamá-lo no boot e mostrar mensagem
> clara é trabalho da task 05 (que já mexe na camada de aviso ao usuário) ou da 10 — decidir na
> hora, sem duplicar.

## Testes manuais
1. `uv run uvicorn src.main:app --reload`.
2. Criar usuário e token (`POST /auth/register`, `/auth/login`, `/auth/tokens`).
3. `curl -H "Authorization: Bearer apk_..." http://localhost:8000/client/me` → 200 com
   `user_id`/`email`/`token_sufixo`.
4. Mesmo curl com token inventado → 401.
5. `curl -X POST -H "Authorization: Bearer apk_..." -d '{}' http://localhost:8000/mapdata.ingest`
   → 200, e o log estruturado registra o descarte.
6. `POST /naoexiste.ingest` → 404 (não virou coringa universal).
7. `POST /marketorders.ingest` continua funcionando normalmente (a rota curinga não o capturou).

## Testes automatizados
Suíte com `testcontainers`, no padrão da task 36 do backend (fixtures compartilhadas em
`tests/conftest.py`, limpeza automática, sem `try/finally`).

- `GET /client/me` com token válido → 200, e o corpo **não** contém o valor cru do token.
- `GET /client/me` sem header → 401; com token revogado → 401.
- `GET /client/me` respeita o rate limit configurado.
- `POST` em cada um dos três tópicos não consumidos → 200, nada gravado em `market_order` /
  `market_history_entry`.
- `POST /marketorders.ingest` continua roteando pro handler certo (regressão da ordem de registro
  — este é o teste que pega o erro do curinga).
- `POST` num tópico desconhecido → 404.

---

## Notas de implementação (2026-08-23) — task concluída

- **Rotas explícitas, não curinga.** A spec deixava as duas opções; escolhi as três rotas
  registradas uma a uma (via `router.add_api_route` num laço sobre `TOPICOS_NAO_CONSUMIDOS`,
  pra não duplicar o handler). Curinga `/{topico}.ingest` transformaria um erro de digitação do
  client num 200 silencioso, e dependeria de ordem de registro pra não capturar
  `/marketorders.ingest`. O teste
  `test_topicos_consumidos_continuam_roteando_para_o_handler_certo` trava isso afirmando **422**
  (schema de marketorders aplicado) em vez de 200 — um curinga daria 200 porque nem lê o corpo.
- **`GET /client/me` num `client_router` separado**, no mesmo arquivo. O `router` de api_tokens
  tem `prefix="/auth/tokens"`, e a rota nova não pertence a esse prefixo — além de ser
  autenticada pelo token opaco, não pelo JWT.
- **`ApiToken` não tem relação com `User`**, só `user_id`. O endpoint faz um
  `session.get(User, token.user_id)` pra resolver o e-mail.
- **O achado `F5` foi confirmado ao vivo**, não só por leitura de código: durante o teste em jogo
  da task 03, o client mandou `mapdata.ingest` numa sessão normal, sem nenhuma ação especial. O
  payload real está versionado em `tests/fixtures/wire/mapdata-real-5003.json` e é usado no teste.

### Achado novo — `F7`: token cru vira chave de Redis

`identificar_por_token` (`src/rate_limit.py:27-30`) devolve o header `Authorization` inteiro, que
vira parte da chave: `rl:ingest:Bearer apk_<token-cru>:/marketorders.ingest`. Ou seja, **o Redis
guarda tokens de API em texto plano** nas chaves de rate limit (TTL de 60s).

É a mesma classe do achado `A1`, que a task 32 corrigiu para o Postgres com o argumento de que "o
servidor não precisa saber o valor, só reconhecer". Impacto menor que o `A1` (Redis é interno e a
chave expira), mas um dump do Redis entrega tokens funcionando.

**Não corrigido aqui de propósito** — a convenção da fase é que bug vizinho vira achado
documentado, não commit extra ([README.md](README.md#convenções-específicas-desta-fase)). O
conserto é pequeno (hashear o identificador antes de montar a chave, `hash_token` já existe em
`src/api_tokens/service.py`) e não muda comportamento observável, só invalida os buckets em voo.
Virou a [Fase 2.5 task 08](../estabilizacao/08-seguranca-do-rate-limit.md), junto da correção da
confiança indevida em `X-Forwarded-For`.
