# Gate final da Fase 2.5

Runbook e registro reproduzível da validação que encerrou a estabilização. O gate automatizado
abaixo fecha a Fase 2.5; o gate integrado foi transferido para depois do frontend completo.

## Gate automatizado

Na raiz:

```powershell
& 'backend\.venv\Scripts\python.exe' 'scripts\verify_repository.py'
```

No backend:

```powershell
uv run ruff check .
uv run ruff format --check .
uv run pytest tests/ -v
docker build -t profitpro-backend .
```

No client:

```powershell
go test ./...
go vet ./client/
go build -o albiondata-client.exe .
```

O workflow [Backend CI](../.github/workflows/backend-ci.yml) repete qualidade Python, migrations
do zero, downgrade/upgrade da última revisão, build/inspeção da imagem, seed idempotente e o
verificador documental. O [Client CI](../.github/workflows/client-ci.yml) executa testes, vet,
race detector, build e validação de formatação num runner Linux com CGO/libpcap.

## Resultado automatizado de 2026-08-23

- Ruff lint e format: verdes.
- Pytest: **229 passed**, com PostgreSQL, Redis e RabbitMQ reais.
- Go: suíte completa e build verdes.
- Go vet no Windows: somente a baseline upstream em
  `client/net_interface_filter_win.go:75` (`unsafe.Pointer`).
- Race detector: configurado como gate do CI Linux; a máquina Windows local não possui GCC.
- Alembic: banco vazio até `head`, downgrade de uma revisão e retorno ao `head` verdes.
- Imagem: build verde, usuário `app`, CMD/healthcheck corretos.
- Seed dentro da imagem: primeira execução `applied`, segunda `unchanged`; **12.062 itens**,
  **5.553 receitas** e uma versão ativa.
- Ambiente Docker vazio: migration, seed, API, workers `ingest`/`maintenance`/`quarantine` e beat
  subiram; `/ready` respondeu com Postgres/dataset/Redis/RabbitMQ `ok`; três workers responderam
  `pong` e cada fila durável tinha um consumidor.
- Verificador estrutural: README obrigatório, ausência de `.git` aninhado, links locais e status
  01–14 coerentes.

Os testes automatizados cobrem dois realms, retry, quarentena/reprocessamento, `scope=mine`,
rollups em bordas UTC, idempotência do seed, isolamento de workers e rate limit. Eles não
substituem o ensaio do binário com tráfego real do jogo.

## Gate integrado após o frontend

Por decisão do proprietário em 2026-08-23, estes testes não bloqueiam mais a Fase 2.5. Eles serão
executados juntos após o frontend estar completo, permitindo validar a jornada inteira sem repetir
o ensaio operacional agora e novamente ao final da Fase 3. A execução e as evidências são o escopo
da [Task 19 da Fase 3](tasks/frontend/19-build-validacao.md).

- [ ] Clonar/instalar em pasta limpa seguindo somente os READMEs.
- [ ] Definir a URL oficial de release e validar boot, token e todos os estados do systray no
  Windows.
- [ ] Com Albion aberto, atravessar uma zona e capturar mercado até RabbitMQ, PostgreSQL, Redis e
  APIs de preços/demanda.
- [ ] Derrubar e restaurar backend e worker durante coleta, confirmando recuperação sem perda
  silenciosa.
- [ ] Repetir o ensaio de forwarded headers/rate limit no domínio e Traefik reais se a topologia
  tiver mudado desde a Task 08.
- [ ] Revisar logs do client, API e workers: nenhum token; stack útil; realm, tópico e correlação
  presentes.
- [ ] Autorizar explicitamente release, tag e push.

## Dívida deliberadamente preservada

- O fork mantém a estrutura e os finais de linha upstream; refactors fora do caminho Profit Pro
  prejudicariam a incorporação futura do upstream.
- Identificadores Python em português anteriores a este gate permanecem por compatibilidade e para
  evitar rename transversal sem benefício funcional. Código novo deve usar inglês.
- O warning Windows de `unsafe.Pointer` pertence ao filtro de interfaces upstream; fica como
  baseline explícita até uma correção isolada e testável.
- Gold prices e tópicos públicos não consumidos continuam descartados de forma observável, fora do
  MVP de crafting/refino.
