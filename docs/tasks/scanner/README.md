# Tasks — Fase 4: Scanner (o backend serve dado, o cliente calcula)

Derivada da revisão de uso real de 2026-09-07, registrada em
[15-arquitetura-do-scanner.md](../../15-arquitetura-do-scanner.md). **Substitui a Fase 3.6**
(ver [Herança da 3.6](#herança-da-fase-36) abaixo).

**Objetivo:** transformar Refino/Craft de um ranking pré-calculado que envelhece em 10 minutos
num **scanner de mercado** — nenhuma receita some por falta de preço, todo filtro responde no
mesmo frame, e o número acompanha o preço mais fresco que existe. A fase termina quando o
jogador consegue varrer o catálogo inteiro, filtrar do jeito dele e decidir o que produzir sem
esperar por nada.

## O problema que originou a fase

| # | Achado | Evidência |
|---|---|---|
| `X01` | **Receita sem preço não existe.** O rebuild só enumera combinações `(item, cidade, qualidade)` que já aparecem em `market_order` **para a saída da receita**. Saída nunca observada ⇒ nenhuma linha, nunca — e nenhum filtro traz de volta. | `src/opportunities/ranking_service.py:174-189` |
| `X02` | Três exclusões implícitas somam-se à `X01`: `min_profit`/`min_roi` comparam contra `NULL`, `require_complete` e `max_age_hours`. Mandar `min_profit=0` apaga silenciosamente toda linha sem preço. | `ranking_service.py:423-426,427-429,430-436` |
| `X03` | **Atraso de até 10 min.** O rebuild roda **um `simulate_craft` completo por combinação, sequencial** (~6,5 ms × 2-4 mil) — só cabe num beat `*/10`. | `ranking_service.py:195-255`, `src/celery_app.py:101-105` |
| `X04` | **Não dá pra filtrar.** Todo filtro é round-trip; peso, foco, faixa de lucro e "mostre tudo" não existem como filtro. | `src/opportunities/service.ts:102-138` |
| `X05` | **O layout desperdiça a tela.** Tudo preso em `max-w-7xl` (1280px), navegação no topo e três blocos de filtro empilhados **acima** da tabela — a tabela nasce abaixo da dobra. | `src/components/AppShell.tsx:133,189`, `production-pages.tsx:332-460` |
| `X06` | **Cobertura refém do próprio usuário.** 100% do dado de mercado vem do nosso client; item que ninguém abriu no jogo não tem preço. Não há nenhum cliente HTTP para fonte externa no backend. | `grep httpx\|requests` em `backend/src` |

## Decisões que guiam a fase

1. **O servidor devolve dado; o cliente calcula resposta.** É a decisão nº 1 de
   [12-revisao-fase-3.md](../../12-revisao-fase-3.md#1-o-cálculo-é-dividido-por-o-que-muda-não-por-onde-roda)
   levada até o fim. A parte que estava certa (camada "e se" no cliente, task 3.5/23) fica; a
   varredura pré-calculada sai.
2. **Nenhuma linha some.** Receita sem preço aparece com `—` e o motivo. Esconder é escolha do
   usuário num checkbox, nunca padrão do servidor.
3. **Duas fontes de preço, uma verdade por linha.** API pública do Albion Data Project dá
   largura; nosso client dá frescor e profundidade. O mais recente vence, e a tela mostra idade
   e fonte.
4. **Duas contas, e a diferença é visível.** Scanner = topo de livro, estimativa, instantânea.
   `POST /craft/simulate` ("Analisar") = livro completo com slippage, exato. O produto nunca
   finge que a primeira é a segunda.
5. **Guard novo nasce vermelho** — herdado da 3.6.

## Ordem e dependências

```text
BLOCO 0 — o servidor passa a servir dado (bloqueante)
01 Peso e categorias no catálogo de itens
02 GET /catalog/recipes                    ── depende de 01
03 price_snapshot + GET /prices/snapshot   (paralelo a 02)
04 Poller da API pública (AODP)            ── depende de 03

BLOCO 1 — o motor no cliente
05 Engine do scanner em Web Worker         ── depende de 02, 03
06 Vetores dourados do scanner             ── depende de 05
07 Cache local do catálogo                 ── depende de 02

BLOCO 2 — a tela (primeira entrega visível)
08 Shell novo: sidebar à esquerda, tela inteira
09 Filtros na sidebar                      ── depende de 08
10 Tabela do scanner                       ── depende de 05, 08
11 Tela de Refino                          ── depende de 09, 10  ◄── prova a arquitetura

BLOCO 2.5 — ajustes vindos do uso real da tela (2026-09-08)
11.1 Navegação colapsável e filtros à direita   ── depende de 11
11.2 Quantidade, ingredientes e investimento    ── depende de 11
11.2.1 Acabamento da tabela                     ── depende de 11.2
11.2.2 Nome curto, coluna fixa e cidades        ── depende de 11.2.1
11.2.3 Retorno de recurso visível no lucro      ── depende de 11.2.2
11.3 Política de preço por ingrediente          ── depende de 11.2  ◄── muda o modelo de linha
11.4 Linha expansível: a linha mostra o serviço ── depende de 11.3
11.5 Estratégia declarada e análise exata      ── depende de 11.4
11.6 Sessão de refino: compra cheia + rendimento ── depende de 11.5

BLOCO 3 — o resto do produto
12 Tela de Craft                           ── depende de 11
13 Comida & Poções                         ── depende de 12
14 Calculadora sobre o engine              ── depende de 05
17 Painel do Destino (eficiencia de foco)  ── depende de 11
18 Taxa da estacao por nutricao            ── depende de 01, 05

BLOCO 4 — a tela que o jogador pediu (achados do uso real, 2026-09-10)
19 Uma linha por receita, ordem de tier     ── depende de 11
20 Colunas enxutas e painel completo        ── depende de 19
21 Abrir vazio e escolher a categoria       ── depende de 19, 20
22 Snapshot so da categoria (opcional)      ── depende de 21
23 Historico da API publica (volume/dia)    ── depende de 04, 20
24 Comprar em, Vender em e escolha por item ── depende de 11.3, 19, 20
25 Preco de compra e de venda na barra      ── depende de 24
26 Retorno de recurso por ingrediente       ── depende de 05, 06, 11.6, 12
27 Itens com mais de uma receita            ── depende de 26
28 Dataset do jogo atualizado               ── depende de 23
29 Volume por dia na hora do upload         ── depende de 23, 28
15 Aposentar o ranking materializado       ── depende de 11, 12
16 Documentos reconciliados                ── depende de 15
```

Implementar **uma por vez** com a skill `/implementar-task`; cada spec é validada contra o
estado real e recebe confirmação explícita antes de alterar código.

## Lista

| # | Task | Corrige | Entrega principal |
|---|---|---|---|
| [01](01-peso-e-categorias-no-catalogo.md) | Peso e categorias no catálogo | — | `item.weight` importado; habilita Lucro p/KG |
| [02](02-endpoint-de-catalogo-de-receitas.md) | `GET /catalog/recipes` | `X01` | Catálogo inteiro, sem depender de preço |
| [03](03-price-snapshot-e-endpoint.md) | `price_snapshot` + endpoint | `X03` | Topo de livro em massa, sem filtro de frescor |
| [04](04-poller-da-api-publica.md) | Poller da API pública | `X06` | Cobertura deixa de depender só dos nossos usuários |
| [05](05-engine-do-scanner.md) | Engine do scanner (Worker) | `X03` | Todas as receitas calculadas no navegador |
| [06](06-vetores-dourados-do-scanner.md) | Vetores dourados do scanner | — | Paridade travada com `simulate_craft` |
| [07](07-cache-local-do-catalogo.md) | Cache local do catálogo | — | Primeiro paint sem esperar rede |
| [08](08-shell-com-sidebar.md) | Shell com sidebar | `X05` | Navegação e filtros à esquerda, tabela ocupa a tela |
| [09](09-filtros-na-sidebar.md) | Filtros na sidebar | `X04` | Filtro por peso, foco, faixa, categoria, "mostrar tudo" |
| [10](10-tabela-do-scanner.md) | Tabela do scanner | `X01` `X02` | Virtualizada, ordena/filtra sobre o conjunto inteiro, **com a arte dos itens** ([fonte](../../06-fontes-de-dados-estaticos.md#arte-dos-itens--serviço-de-render-oficial)) |
| [11](11-tela-de-refino.md) | Tela de Refino | — | 110 receitas × cidades, filtro instantâneo |
| [11.1](11.1-layout-colapsavel-e-filtros-a-direita.md) | Navegação colapsável, filtros à direita | — | Esquerda só navega; filtros vão para a direita |
| [11.2](11.2-quantidade-e-ingredientes.md) | Quantidade, ingredientes e investimento | — | Colunas por ingrediente com quantidade e subtotal |
| [11.2.1](11.2.1-acabamento-da-tabela.md) | Acabamento da tabela | — | Cabeçalho grudado, quantidade inteira, filtro de cidade |
| [11.2.2](11.2.2-nomes-curtos-coluna-fixa-e-cidades.md) | Nome curto, coluna fixa e cidades | — | Recurso encurtado, item sempre visível, uma Lymhurst |
| [11.2.3](11.2.3-retorno-de-recurso-visivel.md) | Retorno de recurso visível no lucro | — | Lote padrão, custo por item, série do retorno explicada |
| [11.3](11.3-politica-de-preco-por-ingrediente.md) | Política de preço por ingrediente | — | Média das cidades, cidade fixa ou preço manual |
| [11.4](11.4-linha-expansivel.md) | Linha expansível | — | Extrato, procedência, cenários, edição de preço |
| [11.5](11.5-estrategia-e-analise-exata.md) | Estratégia e análise exata | — | Premissa declarada; ponte para `/craft/simulate` |
| [11.6](11.6-sessao-de-refino.md) | Sessão de refino | — | Compra pelas receitas iniciais; coluna Rendimento |
| [12](12-tela-de-craft.md) | Tela de Craft | — | 5.523 receitas no Worker; ingredientes resumidos |
| [13](13-comida-e-pocoes.md) | Comida & Poções | `W10` | Aba própria com os insumos da cozinha; a taxa da estação volta às 153 poções que a cobravam zero |
| 14 | Calculadora sobre o engine | — | Instantânea ao digitar |
| [17](17-painel-do-destino.md) | Painel do Destino | — | Custo de foco real: `Lucro/foco` deixa de errar por ate 16x |
| [18](18-taxa-da-estacao-por-nutricao.md) | Taxa da estação por nutrição | `W5` | A estação cobra por nutrição consumida; prata fixa errava por 56x pra mais e 44x pra menos |
| [19](19-uma-linha-por-receita-em-ordem-de-tier.md) | Uma linha por receita, ordem de tier | — | A lista se lê como o mercado do jogo; o modo "todas as cidades" sai |
| [20](20-colunas-enxutas-e-painel-completo.md) | Colunas enxutas e painel completo | — | 8 colunas sem rolagem lateral; o resto no painel |
| [21](21-abrir-vazio-e-escolher-a-categoria.md) | Abrir vazio e escolher a categoria | — | Calcula só a categoria escolhida — substitui a paginação descartada |
| [22](22-snapshot-so-da-categoria.md) | Snapshot só da categoria (opcional) | — | Polling de 30 s com o payload da categoria, não do realm |
| [23](23-historico-da-api-publica.md) | Histórico da API pública | — | Unidades por dia ao lado do preço de venda, com 30 dias desde o primeiro dia |
| [24](24-comprar-em-vender-em-e-escolha-por-item.md) | Comprar em, Vender em e escolha por item | — | Nenhum preço vem de cidade que o jogador não frequenta; cada preço escolhe sua origem no painel |
| [25](25-preco-de-compra-e-de-venda-na-barra.md) | Preço de compra e de venda na barra | — | A origem de todos os preços muda de uma vez; o painel fica para a exceção |
| [26](26-retorno-de-recurso-por-ingrediente.md) | Retorno de recurso por ingrediente | `W6` | Artefato e o que não retorna é comprado para todas as execuções |
| [27](27-itens-com-mais-de-uma-receita.md) | Itens com mais de uma receita | `W7` | Armas e armaduras de artefato de facção entram no catálogo |
| [28](28-dataset-do-jogo-atualizado.md) | Dataset do jogo atualizado | `W9` | O histórico do client volta ao item certo; o da API pública acompanha a renumeração |
| [29](29-volume-por-dia-na-hora-do-upload.md) | Volume por dia na hora do upload | `W11` | O histórico aberto no jogo aparece na tela em segundos, não em até 2 h |
| [15](15-aposentar-o-ranking-materializado.md) | Aposentar o ranking materializado | `X03` | `recipe_ranking` e o beat `*/10` deixam de existir |
| 16 | Documentos reconciliados | — | Specs param de descrever a arquitetura revogada |

> As specs de 05-16 são escritas ao chegar no bloco, para não congelar decisão de UI antes da
> arquitetura de dados estar provada em jogo. O índice acima é o contrato da fase.

## Status

- [x] 01 — Peso e categorias no catálogo
- [x] 02 — `GET /catalog/recipes`
- [x] 03 — `price_snapshot` + endpoint
- [x] 04 — Poller da API pública
- [x] 05 — Engine do scanner (Worker)
- [x] 06 — Vetores dourados do scanner
- [x] 07 — Cache local do catálogo
- [x] 08 — Shell com sidebar
- [x] 09 — Filtros na sidebar
- [x] 10 — Tabela do scanner
- [x] 11 — Tela de Refino
- [x] 11.1 — Navegação colapsável, filtros à direita
- [x] 11.2 — Quantidade, ingredientes e investimento
- [x] 11.2.1 — Acabamento da tabela (cabeçalho, quantidade, filtro de cidade)
- [x] 11.2.2 — Nome curto, coluna fixa e mercados da mesma cidade
- [x] 11.2.3 — Retorno de recurso visível no lucro
- [x] 11.3 — Política de preço por ingrediente
- [x] 11.4 — Linha expansível (extrato, procedência, cenários, edição)
- [x] 11.5 — Estratégia declarada e análise exata
- [x] 11.6 — Sessão de refino (compra cheia, rendimento, estação por execução total)
- [x] 12 — Tela de Craft (Worker, colunas do craft)
- [x] 13 — Comida & Poções
- [ ] 14 — Calculadora sobre o engine
- [x] 17 — Painel do Destino (eficiência de foco)
- [x] 18 — Taxa da estação por nutrição consumida
- [x] 19 — Uma linha por receita, em ordem de tier
- [x] 20 — Colunas enxutas e painel completo
- [x] 21 — Abrir vazio e escolher a categoria
- [x] 22 — Snapshot só da categoria (opcional)
- [x] 23 — Histórico da API pública
- [x] 24 — Comprar em, Vender em e escolha por item
- [x] 25 — Preço de compra e de venda na barra
- [x] 26 — Retorno de recurso por ingrediente
- [x] 27 — Itens com mais de uma receita
- [x] 28 — Dataset do jogo atualizado
- [x] 29 — Volume por dia na hora do upload
- [x] 15 — Aposentar o ranking materializado
- [ ] 16 — Documentos reconciliados

## Herança da Fase 3.6

A [Fase 3.6](../correcoes/README.md) é substituída por esta. Destino de cada task:

| Task 3.6 | Destino |
|---|---|
| `01` Aritmética decimal na entrada | ✅ **Concluída** — `money.divide` e os vetores do percentual digitado seguem valendo no motor novo |
| `02` Entrada de filtro à prova de queda | 🗑️ **Arquivada** — os inputs são reescritos na task 09; a sanitização entra lá |
| `03` ErrorBoundary de verdade | ♻️ **Absorvida pela task 08** — o shell novo nasce com `ErrorBoundary` |
| `04` Erros de formulário na Calculadora | 🗑️ **Arquivada** — a Calculadora é reescrita na task 14 |
| `05` Formatação do client e gate verde | ⏩ **Segue valendo** — independe de UI |
| `06` Contrato inglês completo | ⏩ **Segue valendo**, aplicado aos endpoints novos (02, 03) |
| `07` Guards de frontend que guardam | 🗑️ **Arquivada** — os guards são refeitos junto das telas (task 10 reescreve `no-client-paging-mutation`) |
| `08` Baseline Git verificado | ⏩ **Segue valendo** — independe de UI |
| `09` Índice trigram no modelo | ⏩ **Segue valendo** — a busca por texto da task 09 depende dele |
| `10` Tipo único de dinheiro | ⏩ **Segue valendo**, aplicado ao contrato novo |
| `11` Retry real e erro visível | ♻️ **Absorvida pelas tasks 08 e 10** |
| `12` E2E do núcleo do produto | 🗑️ **Arquivada** — reescrita ao fim do Bloco 3, sobre as telas novas |
| `13` Serving e deploy do frontend | ⏩ **Segue valendo** — independe de UI |
| `14` "Abrir Calculadora" no systray | ⏩ **Segue valendo** |
| `15` Decisão sobre a 20.4 | ⏩ **Segue valendo** — afeta a confiança no preço, que o scanner exibe |
| `16` Documentos reconciliados | ♻️ **Absorvida pela task 16** desta fase |
| `17` Higiene de repositório e imagem | ⏩ **Segue valendo** |

## Convenções específicas desta fase

- Herda as convenções da [Fase 3.5](../refatoracao/README.md#convenções-específicas-desta-fase)
  e da [3.6](../correcoes/README.md#convenções-específicas-desta-fase).
- **Nenhum endpoint novo esconde linha.** Filtrar é direito do cliente; o servidor devolve o que
  existe, com os metadados (idade, fonte, cobertura) para o cliente decidir.
- **Todo número exibido tem procedência.** Cada linha carrega `observed_at` e `source`; a tela
  nunca mostra um valor sem poder dizer de quando e de onde ele veio.
- Frontend: `npm run lint && npm run typecheck && npm run test` antes de concluir cada task.
- Backend: `uv run pytest tests/ -v && uv run ruff check .` antes de concluir cada task.
- Toda task que altera OpenAPI regenera `frontend/src/api/schema.d.ts` no mesmo commit.

## Achados da fase

| # | Achado | Corrigido em |
|---|---|---|
| `W1` | **Taxa de montagem por ingrediente.** `_build_scenario` soma `part.setup_fee` de cada ingrediente; o motor do cliente cobrava `ceil()` uma vez sobre o total somado. Dois ingredientes de 100 dão 6 no servidor e davam 5 no cliente. | task 06 |
| `W4` | **Virtualização não é testável em jsdom.** `@tanstack/react-virtual` depende de layout real; nem stub de `getBoundingClientRect`, nem polyfill de `ResizeObserver`, nem `initialRect` fazem o virtualizador renderizar em jsdom. Teste removido em favor de guard textual + verificação no navegador. | task 10 |
| `W3` | **Guard textual verde testando nada.** O `` de uma regex virou byte backspace (`0x08`) ao passar por heredoc de shell; o teste passava sem casar nada. Só apareceu porque o guard *deveria* nascer vermelho. Escrever regex de guard pelo editor, não por script. | task 09 |
| `W5` | **A taxa da estação não é prata por execução.** O jogo cobra por **nutrição consumida**, e a nutrição sai do valor do item (`itemvalue × 0,1125`). Prata fixa cobrava 56× demais num recurso T4 e 44× de menos numa arma T8 Avalon — o erro **troca de sinal**, então nenhum valor digitado ficava certo em duas linhas ao mesmo tempo. `@itemvalue` nunca tinha sido importado, e o dump não o publica para arma nem equipamento. | task 18 |
| `W6` | **Retorno de recurso aplicado a ingrediente que não retorna.** O dump marca artefato, cristal, token e afins com `@maxreturnamount="0"`; o importador descarta a marca, e cliente e servidor aplicam o retorno à receita inteira. Numa receita com artefato, 600 receitas a 36,7% compravam 600 artefatos para 947 execuções. 1.356 receitas de craft afetadas. | task 26 |
| `W7` | **Item com mais de uma receita fica fora do catálogo.** O importador pula `craftingrequirements` em lista fora do refino: 727 itens base e 2.420 níveis encantados, quase todos equipamento de artefato de facção (artefato × token de favor). | task 27 |
| `W8` | **O rollup diário e mensal parou quando o histórico cresceu.** `_rollup_diario` e `_rollup_mensal` inseriam com `INSERT ... VALUES`, 8 parâmetros por linha agregada; acima de 4.095 linhas passava do limite de 32.767 do asyncpg. O `InterfaceError` era tratado como transitório, então o job tentava de novo e caía de novo, e o `poda` falhava junto. A tabela diária estava parada em 2.194 linhas quando o histórico pedia 11.210. Virou `INSERT ... SELECT ... GROUP BY`, agregado no banco. | correção antes da task 23 (2026-09-11) |
| `W9` | **O histórico do client está atribuído ao item errado.** O livro chega com o nome do item; o histórico, com o `AlbionId` numérico resolvido pelo `Index` do `items.json` do dataset. Em `market_scan`, de 440 varreduras de histórico com uma de livro a menos de 90 s na mesma cidade, só 43 são do mesmo item; o preço médio do histórico fica 22× o de mercado na mediana. Provável reordenação de índices do jogo depois da revisão `5cf2e8e9`. Com a regra "o client vence" da task 23, o bloco errado segura o certo da API pública. | task 28 |
| `W10` | **A taxa da estação entrava como zero em 153 das 172 poções.** A derivação do valor do item (task 18) desistia quando um ingrediente não tinha valor — o extrato arcano, em toda poção encantada, e as partes de animal raro, em 8 tipos inteiros. Medido na estação do alquimista a 320 por 100 de nutrição: Poção de Cura T4.1 custou 432 e Poção de Fúria T4, 230 — exatamente os ingredientes com valor, com o resto contando zero. A mesma regra deu valor a 303 capas de facção, bolsas e montarias, que também cobravam zero. | task 13 |
| `W11` | **O volume por dia chegava à tela até 2 h depois do upload.** `GET /prices/sales` lê só o diário, refeito de hora em hora; o frontend guardava a resposta 1 h e ignorava o foco. Medido ao vivo: séries do client que chegaram antes do rollup das 03:00 batiam em 836/836 dias, as que chegaram depois divergiam em 84/110. | task 29 |
| `W2` | **Encantamento da saída tem duas fontes.** O servidor usa `recipe["enchantment_level"]` (coluna); o cliente derivava do sufixo `@N` do nome. Coincidem no dado real, mas o modo de falha seria silencioso — combo inexistente virando "sem preço". | task 06 |
