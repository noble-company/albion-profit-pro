# 09 — Backend: ingest de eventos de craft

> # ❌ DESCOPADA (2026-08-23) — não implementar
>
> Contraparte das tasks 07/08, também descopadas. A justificativa desta task foi reescrita duas
> vezes conforme os dados chegavam (de "lucro previsto vs. real" para "taxa de estação ao vivo") e
> nenhuma das duas sobreviveu: taxa de estação, taxa de retorno e quantidade são **informadas pelo
> jogador**. Racional completo em [README.md](README.md#por-que-07-09-foram-descopadas-2026-08-23).
>
> O texto abaixo é mantido como registro do raciocínio.

## Objetivo
Receber, validar e persistir o tópico `craftevents.ingest` — reusando integralmente a maquinaria de
ingest que a Fase 1.5 deixou pronta.

## Por que

É a contraparte da task 08. Sem ela o POST volta 404 e o dado de craft não existe pra ninguém.

> ⚠️ **Escopo reorientado em 2026-08-23, depois da task 06.** A versão anterior desta seção dizia
> que o valor era *"saber o que você realmente produziu"*, e que isso alimentaria um
> "lucro previsto vs. lucro real". **Duas coisas invalidaram isso:**
>
> 1. **O dado não existe.** `evCraftItemFinished` não carrega quantidade produzida — só o que foi
>    **devolvido** pela taxa de retorno (medido, ver [doc 03 §8b](../../03-contrato-ingest-real.md)).
> 2. **E não faz falta.** Decisão de produto do usuário: a calculadora é ferramenta de
>    **planejamento** — o jogador informa quanto *quer* produzir e vê custo e lucro. Histórico do
>    que ele produziu é irrelevante pra isso.

**O que de fato diferencia a nossa calculadora é a taxa de uso da estação**, que vem no
`evCraftBuildingInfo` (campo 2, prata ×10.000 — confirmado contra a UI do jogo: estação `1413`
exibindo "999" e mandando `9990000`).

Receita, preço de mercado e taxa de mercado são públicos — qualquer um tem, o Albion Data Project
publica de graça. **Taxa de estação ao vivo, por cidade, não existe em lugar nenhum**: é definida
pelo dono da estação e muda a toda hora. É o insumo que permite responder *"onde sai mais barato
produzir isso agora"*, que é exatamente a pergunta que a calculadora existe pra responder.

Medido em três estações na mesma sessão: **999**, **950** e **495** — variação de mais de 2× no
custo, invisível pra quem usa número teórico.

## O que implementar

> ⚠️ **O schema exato depende das tasks 06 e 08.** Esta spec descreve a forma e o que reusar;
> os campos concretos vêm do payload confirmado. Atualizar antes de implementar.

Tudo aqui já tem precedente direto no código — é montagem, não invenção.

### Schema (`src/ingest/schemas.py`)

Espelhar o struct Go **verbatim** via `Field(alias=...)`, jamais renomeando no fio
(`CLAUDE.md`, "Match the Go client's wire contract exactly"):

```python
class CraftEventIn(BaseModel):
    character_id: str = Field(alias="CharacterId")
    character_name: str = Field(alias="CharacterName")
    station_id: int = Field(alias="StationId")
    item_id: int = Field(alias="ItemId")
    amount: int = Field(alias="Amount")
    # ... conforme task 06/08

    model_config = {"populate_by_name": True}


class CraftEventUploadIn(BaseModel):
    events: list[CraftEventIn] = Field(alias="Events", max_length=MAX_ITENS_POR_LOTE)

    model_config = {"populate_by_name": True}
```

`MAX_ITENS_POR_LOTE` já existe (`src/ingest/schemas.py:23`) e vale pra **toda** lista de ingest —
não abrir exceção aqui.

### Rota (`src/ingest/router.py`)

Idêntica em forma às três existentes — herda o rate limit por token declarado no router
(`src/ingest/router.py:12-17`):

```python
@router.post("/craftevents.ingest", status_code=200)
async def ingest_craft_events(
    payload: CraftEventUploadIn,
    token: ApiToken = Depends(require_api_token),
):
    process_craft_events.delay(payload.model_dump(by_alias=False), user_id=str(token.user_id))
    return {}
```

**Registrar antes da rota curinga da task 04** (`/{topico}.ingest`), senão o curinga a captura —
mesmo cuidado de ordem que `src/main.py:48-53` documenta.

### Task Celery (`src/ingest/tasks.py`) e serviço (`src/ingest/service.py`)

Seguir a separação que a task 36 estabeleceu: `tasks.py` só orquestra, `service.py` faz o acesso a
banco. O wrapper reusa `_run_async` (`src/ingest/tasks.py`), que já resolve o ciclo de vida async
no worker (engine `NullPool` descartável por task — achado `C1`, task 23) e o
retry/logging (`RETRYABLE_EXCEPTIONS`, task 24). Ou seja: a task nova ganha tudo isso de graça,
desde que siga o padrão.

```python
@celery_app.task(
    name="ingest.process_craft_events",
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def process_craft_events(self, payload: dict, user_id: str) -> None:
    _run_async(
        "craftevents",
        user_id,
        len(payload["events"]),
        lambda sessionmaker, redis: save_craft_events(sessionmaker, redis, payload, user_id),
    )
```

### Modelo e migration

Domínio: **`src/crafting/`** (novo) ou `src/recipes/`? Craft realizado é fato observado; receita é
dado estático de referência. São coisas diferentes e provavelmente merecem módulos separados —
decidir na implementação e registrar a decisão no `docs/00-plano-macro.md`, conforme a convenção do
`CLAUDE.md` ("When you make an architecture decision... update the relevant doc").

Diferente de `market_order`/`market_history_entry`, aqui o `user_id` **pertence à tabela-fato**: um
craft é do usuário por definição, não é dado global do servidor do jogo. Isso é o oposto da decisão
das tasks 26/27 (achados `M7`/`C2`), e a diferença é intencional — vale um comentário no modelo
explicando, pra ninguém "corrigir" isso depois por simetria.

Aplicar as convenções que a Fase 1.5 fixou:
- **Prata ÷ 10.000 na borda do ingest** (`silver_from_wire`, `src/ingest/normalize.py`) se houver
  qualquer campo de prata — achado `N1`, e a razão de existir da task 25.
- **Tick .NET → `TIMESTAMPTZ`** (`datetime_from_ticks`) se houver timestamp.
- **Idempotência**: o client pode reenviar. Definir a chave natural do evento e usar
  `ON CONFLICT DO UPDATE`, como `uq_market_order_source` (task 27). Se não houver ID estável de
  evento vindo do jogo, isso precisa de decisão explícita — reprocessar não pode inflar produção.

Migration Alembic no padrão: `uv run alembic revision --autogenerate -m "..."`, depois **limpar os
marcadores de autogenerate e imports não usados** (o per-file-ignore do ruff foi removido na task
36 — migration suja agora quebra o lint).

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Tasks 06 e 08 (formato do payload). Independente das tasks 01-05 do client.

## Testes manuais
1. `uv run alembic upgrade head`.
2. API + worker de pé; `curl -X POST -H "Authorization: Bearer apk_..." -d @payload.json
   http://localhost:8000/craftevents.ingest` com o payload real capturado → 200.
3. `SELECT * FROM <tabela>` → linha gravada, prata/timestamp na escala certa.
4. Reenviar o mesmo payload → não duplica.
5. Sem header de auth → 401. Payload fora do contrato → 422 (e o log estruturado registra a
   rejeição, `src/main.py:60-65`).

## Testes automatizados
Suíte `testcontainers` no padrão da task 36 — fixtures compartilhadas em `tests/conftest.py`,
limpeza automática, **sem** `try/finally` manual.

- **Teste de contrato contra o payload real** (`tests/ingest/test_contrato_wire.py`): o arquivo
  versionado em `tests/fixtures/wire/` (gerado pela task 08) valida contra `CraftEventUploadIn`.
  Este é o teste que impede os dois lados divergirem — foi a ausência dele que deixou os achados
  `N1`/`N2`/`N3` passarem por 51 testes verdes na Fase 1.
- Gravação: payload real → linhas corretas, com as conversões de escala/tempo aplicadas.
- Idempotência: mesmo payload 2× → contagem estável.
- Rota: 200 com token válido, 401 sem, 422 com payload inválido, 422 acima de
  `MAX_ITENS_POR_LOTE`.
- **Wrapper síncrono da task Celery** chamado 2× seguidas (via executor, padrão de
  `tests/ingest/test_tasks_lifecycle.py`) → sobrevive. É o buraco `C1`, e a task 36 fechou pros
  dois tópicos existentes; o tópico novo precisa da mesma cobertura desde o início.
- Regressão de ordem de rota: `/marketorders.ingest` e `/craftevents.ingest` continuam roteando
  pros handlers certos, não pro curinga da task 04.
