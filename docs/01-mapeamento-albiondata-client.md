# Mapeamento do albiondata-client

Documento de referência sobre como o `albiondata-client` funciona internamente, o que ele coleta hoje, e como estendê-lo — em especial para capturar **crafting/refino em tempo real**.

Repositório: https://github.com/ao-data/albiondata-client (MIT).

## 1. Visão geral

O `albiondata-client` é o client oficial em Go do **Albion Online Data Project**. Ele roda na máquina do jogador, "escuta" (sniff) o tráfego de rede local gerado pelo próprio cliente do Albion Online (protocolo Photon sobre UDP, porta 5056), extrai eventos de interesse (principalmente dados de mercado) e envia esses dados para um servidor central que qualquer pessoa pode assinar (via NATS público).

- **Legalidade**: o README cita confirmação da Sandbox Interactive (dev do jogo) de que monitoramento passivo de tráfego é permitido, desde que nada seja modificado/injetado — o client só lê pacotes, nunca escreve no tráfego do jogo.
- **Licença**: MIT.
- **Mantenedores atuais**: Stanx (mantenedor principal desde 2023) e Walkynn; criado originalmente por Regner, pcdummy e Ultraporing, com longa manutenção por broderickhyman.
- **Projetos relacionados** que consomem os dados publicados: `albiondata-deduper-dotNet` (dedup), `albiondata-sql-dotNet`, `albiondata-api-dotNet`, `AlbionData.Models` (NuGet), site albion-online-data.com.

## 2. Como rodar / buildar

Não há subcomandos (sem Cobra) — é um binário único com flags via `flag` padrão do Go. Entry point: `albiondata-client.go` (raiz, package `main`).

### Flags principais (`client/config.go`)
| Flag | Efeito |
|---|---|
| `-version` | Imprime versão e sai |
| `-debug` / `-trace` | Verbosidade de log |
| `-de <codes>` / `-events-ignore` | Debug de eventos específicos (whitelist/blacklist por código) |
| `-do <codes>` / `-operations-ignore` | Debug de operações específicas |
| `-ignore-decode-errors` | Suprime logs de erro de decode |
| `-no-limit` | Desliga o limite de 25% de CPU usado para resolver o Proof-of-Work do upload |
| `-d` | Desabilita upload por completo (útil para só observar localmente) |
| `-l <devices>` | Restringe a interfaces de rede específicas |
| `-o <path>` | Modo offline: processa um `.pcap` ou `.gob` gravado em vez de capturar ao vivo |
| `-i <urls>` | Destino(s) de ingest público. Default: `https+pow://albion-online-data.com`. Aceita `nats://`, `http(s)://`, `http(s)+pow://`, múltiplos separados por vírgula |
| `-p <urls>` | Destino(s) de ingest privado (dados pessoais: skills, notificações de venda) |
| `-record <path>` | Grava os pacotes Photon brutos capturados em um `.gob` para replay/debug posterior |
| `-minimize` | Minimiza a janela/tray ao iniciar |

### Requisitos
- **Windows**: driver de captura (Npcap/WinPcap) — o instalador NSIS (`pkg/nsis/`) já embute `thirdparty/WinPcap_4_1_3.exe`.
- **Linux**: `libpcap-dev` instalado; para rodar sem root: `sudo setcap cap_net_raw,cap_net_admin=eip <binário>`.
- **macOS**: `run.command` pede senha (permissão de captura).

### Build
`Makefile` na raiz só chama os scripts em `scripts/` (`build-windows.sh`, `build-linux.sh`, `build-darwin.sh`). Em dev, `go build` direto funciona (Go 1.24, módulos com `vendor/` completo — dá pra buildar offline).

### Configuração (`config.yaml`, lido via viper)

Além do WebSocket local, o arquivo configura o destino e o token do Profit Pro:
```yaml
PublicIngestBaseUrls: https+token://api.seu-dominio.com
ApiToken: apk_exemplo
EnableWebsockets: true
AllowedWebsocketHosts:
  - localhost
```

Precedência: flags `-i`/`-token` → `config.yaml` → URL injetada no build de release → default
`http+token://localhost:8000` somente em desenvolvimento. Release sem URL fica fail-closed, com
upload desabilitado. No boot, `client/bootstrap.go` deriva `/client/me` com `net/url`, valida o
token em até 5 segundos e só então libera destinos autenticados. `401` pausa; `5xx`/timeout entram
em uma única recuperação com backoff. O systray mostra o estado e oferece **Reload Configuration**.
Realm não faz parte de `/client/me`: ele só é conhecido após observar tráfego real do Albion e é
um segundo gate obrigatório antes de enfileirar dados.

## 3. Estrutura de pastas

| Pasta | Propósito |
|---|---|
| `albiondata-client.go` | Entry point (`main`), parsing de flags, auto-updater, inicialização do systray |
| `client/` | Núcleo: config, orquestração de captura, decode do protocolo, modelos de operação/evento, dispatch de upload — a maior parte do código relevante está aqui |
| `client/photon/` | Sub-pacote isolado: parser do protocolo Photon (framing de pacotes, comandos confiáveis/não-confiáveis, reassembly de fragmentos, deserialização de tipos) — sem dependência de terceiros, implementado do zero |
| `lib/` | DTOs simples (structs) usados para upload em JSON — `MarketOrder`, `GoldPricesUpload`, `MapDataUpload`, etc. Espelham o contrato da API pública de ingest |
| `log/` | Wrapper fino sobre `logrus` |
| `notification/` | Notificações desktop nativas (split por SO via build tags) |
| `systray/` | Ícone/menu de bandeja do sistema (split por SO) |
| `pkg/nsis/` | Script do instalador Windows (NSIS), embute o driver WinPcap |
| `thirdparty/` | Dependências nativas vendorizadas para build Windows (WinPcap installer, SDK headers/libs, rcedit) |
| `scripts/` | Scripts de build/dev por SO + fmt |
| `winres/`, `icon/` | Recursos/ícone do binário Windows |
| `vendor/` | Árvore completa de dependências Go vendorizadas |
| `.github/workflows/` | CI: build de release (`main.yml`) e build de validação em cada push/PR (`test-build.yml`) |

### Dependências-chave (`go.mod`)
- `google/gopacket` — captura/decodificação de pacotes (wrap de libpcap/Npcap)
- `nats-io/go-nats` — client NATS (uma das opções de transporte de upload)
- `gorilla/websocket` — servidor WebSocket local opcional
- `mitchellh/mapstructure` — decodifica os parâmetros genéricos do Photon (`map[byte]interface{}`) em structs Go tipados
- `spf13/viper` — só para o `config.yaml` do WebSocket
- `sirupsen/logrus`, `getlantern/systray`, `ao-data/go-githubupdate` (auto-update)
- **Não há lib de terceiros para o protocolo Photon** — é reimplementado à mão em `client/photon/`, como port do `PhotonParser.cs` do projeto `JPCodeCraft/AlbionDataAvalonia`.

## 4. Fluxo de dados ponta a ponta

```
NIC (interface física)
  → client/net_interface_filter*.go — enumera adaptadores, filtra MACs de VM/túnel
  → client/albion_watcher.go: albionProcessWatcher.createListeners()
       porta fixa 5056, um *listener por interface física
  → client/listener.go: listener.startOnline(device, port)
       pcap.OpenLive(...) + SetBPFFilter("tcp port 5056 || udp port 5056")
  → listener.run() → listener.processPacket(packet)
       extrai payload UDP/TCP, extrai IP de origem (usado depois para
       decidir servidor de ingest: west/east/europe)
       se -record ativo, grava payload bruto em .gob
       chama parser.ReceivePacket(payload)
  → client/photon/parser.go — parser Photon:
       framing de pacote, comandos (reliable/unreliable/fragment),
       reassembly de fragmentos, CRC32
  → client/photon/deserializer.go — deserializa o payload tipado do
       Protocol18 em map[byte]interface{}
  → dispara OnRequest / OnResponse / OnEvent (callbacks em listener.go)
  → client/decode.go: decodeRequest / decodeResponse / decodeEvent
       switch no código numérico (OperationType/EventType, enums em
       client/operations.go e client/events.go) → instancia struct
       tipada, preenchida via mapstructure a partir dos parâmetros
  → struct implementa a interface `operation { Process(state *albionState) }`
       (client/operation_*.go ou client/event_*.go)
  → client/router.go: Router.run() → op.Process(albionState), serializado
  → Process() monta um lib.*Upload e chama
       client/dispatcher.go: sendMsgToPublicUploaders / sendMsgToPrivateUploaders
  → dispatcher serializa em JSON e enfileira por destino configurado
       + espelha no WebSocket local
  → client/uploader_queue.go → fila limitada + um worker ordenado por destino
  → client/bootstrap.go → valida configuração/token em /client/me e mantém o gate autenticado
  → client/uploader_{http_pow,http,nats}.go — três transportes reutilizáveis,
       selecionados pelo esquema da URL de destino; somente `http(s)+token`
       traduz AODataServerID 1/2/3 para west/east/europe e envia
       `X-Albion-Server`; se ainda for 0/desconhecido, segura esse upload
       autenticado e emite log/notificação debounced
```

**Estado compartilhado**: `client/albion_state.go` (`albionState`) guarda `LocationId`,
`CharacterId/Name`, IP do servidor de jogo e o servidor de ingest resolvido. Desde a Fase 2.5 task
09, listeners transformam mudanças de servidor/criptografia em operações e apenas a goroutine do
router executa `Process()`. Uploaders recebem um snapshot mínimo do realm, nunca o estado vivo.
Respostas de histórico fora de ordem ficam em cache limitado pelo `MessageID` exato, sem bloquear
o router esperando a requisição correlata.

**Contrato de realm (Fase 2.5 task 03):** o listener atualiza `AODataServerID` pelo IP de origem
antes do decode. `client/market_server.go` é a única tradução para os valores de produto
`west`/`east`/`europe`. O header nunca é anexado aos uploaders comuns ou `+pow`, evitando vazar
metadado do Profit Pro para terceiros. Veja também [doc 03 §8a](03-contrato-ingest-real.md).

## 5. O que é capturado hoje

| Dado | Operação/Evento fonte | Upload (`lib/`) | Tópico |
|---|---|---|---|
| Ordens de mercado (compra/venda) | `opAuctionGetOffers`, `opAuctionGetRequests` (respostas) | `MarketUpload` | `marketorders.ingest` |
| Histórico de preços | `opAuctionGetItemAverageStats` | `MarketHistoriesUpload` | `markethistories.ingest` |
| Preço do ouro | `opGoldMarketGetAverageInfo` | `GoldPricesUpload` | `goldprices.ingest` |
| Dados de mapa/território (taxas, comida, dono) | `opGetClusterMapInfo` | `MapDataUpload` | `mapdata.ingest` |
| Eventos de red zone/bandidos | `evRedZoneWorldMapEvent` | `BanditEvent` | `banditevent.ingest` |
| Festividades ativas | `evFestivitiesUpdate` | `FestivitiesUpload` | `festivities.ingest` |
| Notificação de venda/expiração no mercado (pessoal) | `opReadMail` | `MarketNotificationUpload` | `marketnotifications` (só se `-p` configurado) |
| Skills/fama (pessoal) | *(handler pronto, mas desconectado — ver seção 6)* | `SkillsUpload` | `skills` (não ativo hoje) |
| Leilão de imóveis (real estate) | `opRealEstateGetAuctionData`/`BidOnAuction` | *(struct existe, `Process()` só loga — sem upload implementado)* | — |

Todos os uploads públicos são enviados em JSON, sem nenhuma deduplicação no client (cada evento capturado é enviado imediatamente). Dedup, se necessário, é feito por um serviço separado (`albiondata-deduper-dotNet`) do lado do servidor.

> 📐 **O formato e a semântica exatos desses payloads foram medidos com o jogo ao vivo em
> 2026-08-22** — escala da prata, unidade dos timestamps, o que `Timescale` realmente significa,
> formatos de `LocationId` e quanto de duplicação chega de fato. Está em
> [03-contrato-ingest-real.md](03-contrato-ingest-real.md), com os payloads crus versionados em
> `backend/tests/fixtures/wire/`. **Esse documento tem precedência** sobre qualquer descrição
> de formato feita aqui ou nas specs das tasks.
>
> Sobre "sem nenhuma deduplicação no client": medido, isso custa **2,0×** — uma visita ao
> mercado de ~10 segundos mandou 194 ordens para 97 leilões reais, com os mesmos `Id`s.

## 6. O que existe no protocolo mas NÃO é capturado hoje

Este é o ponto central para qualquer expansão. `client/operations.go` define **~560 códigos de operação** e `client/events.go` define **~695 códigos de evento** — cobrindo praticamente tudo que o cliente do jogo pode trocar com o servidor (combate, inventário, guilda, hideouts, facções, pesca, dungeons, chat, crafting, etc.). Porém:

- `decodeRequest`/`decodeResponse` (`client/decode.go`) só tratam **7 a 12** desses códigos de operação.
- `decodeEvent` só trata **2** códigos de evento (`evRedZoneWorldMapEvent`, `evFestivitiesUpdate`).
- Tudo o mais cai no `default: return nil, nil` e é **descartado silenciosamente** — só aparece no log se `-de`/`-do` estiver habilitado para aquele código específico.

Há inclusive dois handlers **já implementados mas desligados de propósito** em `decode.go` (comentados, com TODO sobre o código do evento não estar confirmado após updates do jogo):
- `eventPlayerOnlineStatus` (`client/event_player_online_status.go`) — status online/offline de outros jogadores.
- `eventSkillData` (`client/event_skill_data.go`) — fama/nível de skills, upload pronto para `lib.SkillsUpload` mas inatingível porque o `case` está comentado.

Isso mostra o padrão de extensão do projeto: o struct e o upload já existem, só falta reconectar o `case` com o código de evento correto.

### Crafting/refino especificamente

Busca nos enums (`client/events.go`, `client/operations.go`) por termos relacionados a craft/refine encontrou:

| Código | Tipo | O que provavelmente representa |
|---|---|---|
| `evCraftItemFinished` | Evento | Dispara quando um craft termina — **candidato nº1** para capturar resultado de craft (item produzido, quantidade — payload exato a confirmar) |
| `evCraftingFocusUpdate` | Evento | Atualização de pontos de foco (afeta custo/retorno de craft) |
| `evCraftBuildingInfo` | Evento | Informações da estação de craft (bônus, especialização — relevante para "taxas de estação") |
| `evRegenerationCraftingChanged` | Evento | Taxa de regeneração de foco |
| `opCraftBuildingChangeSettings` | Operação | Ajuste de configurações/taxas de uma estação de craft |
| `opCraftBuildingTakeMoney` | Operação | Retirada de dinheiro acumulado em taxas de uma estação |

**Nenhum código com "refine"/"refin" foi encontrado nos enums.** Duas hipóteses, a confirmar empiricamente:
1. Refino usa os mesmos códigos de craft acima (mecanicamente, craft e refino usam a mesma interação de estação no jogo — só muda a receita).
2. Existe um código ainda não identificado/nomeado corretamente no enum (o enum tem lacunas e códigos com nomes especulativos em vários pontos do arquivo).

Nenhum desses seis códigos tem handler ativo hoje — todos caem no `default` de `decode.go`.

## 7. Ponto de integração local recomendado

O client expõe um **servidor WebSocket local opcional** (`ws://localhost:8099/ws`), que é o melhor gancho para o Albion Profit Pro consumir dados sem depender do servidor de ingest remoto:

- Habilitado via `config.yaml`:
  ```yaml
  EnableWebsockets: true
  AllowedWebsocketHosts:
    - localhost
  ```
- Implementado em `client/ws_hub.go` / `client/ws_client.go`, servido por `client/dispatcher.go` (`runHTTPServer`, porta `8099`).
- **Origem restrita**: só aceita conexões cujo header `Origin` bata com `AllowedWebsocketHosts` — o Albion Profit Pro precisaria rodar em um host permitido (ex: `localhost`).
- **O que trafega**: exatamente o mesmo JSON que vai para os uploaders configurados, envelopado como `{"topic": "<topic>", "data": <json>}` — inclusive os novos tópicos que viermos a criar para crafting/refino.
- **Vantagem**: nenhuma resolução de Proof-of-Work necessária, nenhuma dependência de rede externa, latência mínima.

## 8. Plano de expansão — crafting/refino em tempo real

> ⚠️ **Esta seção 8 foi superada pela captura de 2026-08-23** ([task 06](tasks/client/06-captura-craft-refino.md)).
> O conteúdo abaixo é mantido como registro do raciocínio, mas **três interpretações dele estão
> erradas** e foram corrigidas em [03-contrato-ingest-real.md §8b](03-contrato-ingest-real.md),
> que tem precedência:
>
> 1. **Os campos 3 e 4 não são "matéria-prima usada" e "quantidade produzida"** — são os itens
>    **devolvidos** pela taxa de retorno e suas quantidades. Medido com entrada controlada
>    (10 fibras → 1 evento com `04`, batendo com os 4 devolvidos na tela do jogo).
> 2. **Campos 3 e 4 vazios não significam "fim do lote"** — significam craft sem devolução.
> 3. **Não há um evento por unidade produzida.** Refinar 10 fibras numa ação gera **um** evento.
>
> A pergunta em aberto sobre identificar o jogador local **foi respondida**:
> `evCraftingFocusUpdate` é privado e isola o ator (2 de 14 atores numa cidade cheia). O ID do
> ator é efêmero e muda a cada zona; `evNewCharacter` não serve de ponte porque não dispara para
> o próprio jogador.

### Passo 1 — Confirmar payloads reais ✅ CONCLUÍDO (captura ao vivo em 2026-08-21)

Rodamos o client compilado localmente (`go build`, Go 1.27) com Npcap instalado, usando:
```
albiondata-client.exe -debug -events "10,49,71,94" -operations "47,48" -d
```
(códigos numéricos corretos — atenção: **`-events`/`-operations` esperam o ID numérico do enum, não o nome**; os valores exatos foram obtidos contando a posição de cada constante no bloco `iota` de `client/events.go`/`client/operations.go`: `evCraftingFocusUpdate=10`, `evCraftBuildingInfo=49`, `evCraftItemFinished=71`, `evRegenerationCraftingChanged=94`, `opCraftBuildingChangeSettings=47`, `opCraftBuildingTakeMoney=48`).

**Importante — correção pós-captura**: nesta sessão só foi feito **refino de fibra** (nenhum craft, nenhum uso ativo de foco). Cruzando os IDs de item capturados com o `items.json` do projeto principal (`Albion Profit Pro/items.json`), foi possível identificar exatamente o que cada evento representa — e isso revelou um achado mais importante que "craft vs refino":

| ID capturado | Item real | Observação |
|---|---|---|
| `167` | `T3_FISH_FRESHWATER_STEPPE_RARE` (peixe) | Sem relação com craft/refino — ver nota abaixo |
| `1020` | `T2_FIBER` (Algodão, matéria-prima) | Item da sua própria ação de refino |
| `966` | `T3_ORE` (Minério de Estanho, matéria-prima) | De um evento com ator **diferente** — não foi você |
| `1081` | `T2_METALBAR` (Barra de Cobre, material refinado) | Mesmo evento acima — outro jogador |

#### Achado principal: `evCraftItemFinished` (71) é compartilhado entre jogadores próximos
O client fareja todo o tráfego que passa pela interface de rede — não só as suas próprias ações. O primeiro evento capturado (`0:1083982 1:167 2:[1084687]`, às 17:05:49) trouxe um item de **peixe**, sem nenhuma relação com estação de craft — provavelmente sobra de outra atividade (pesca) de outro jogador nas proximidades, usando o mesmo código de evento genérico.

Nos dois blocos de eventos reais de refino capturados, os **atores (`campo 0`) e estações (`campo 1`) são diferentes entre si**:
- Bloco A — ator `1056842`, estação `1413`, item `[1020]` (T2_FIBER) → **essa é a sua ação real** (bate com "refino de fibra" que você confirmou).
- Bloco B — ator `1055360`, estação `1362`, itens `[966, 1081]` (T3_ORE + T2_METALBAR) → **não foi você** — é outro jogador refinando/transmutando minério em outra estação, capturado de passagem.

**Implicação prática para o Albion Profit Pro**: qualquer handler de craft/refino precisa filtrar por "isso sou eu" antes de contar como dado válido de lucro — senão o app mistura dados de outros jogadores com os seus. Ainda não confirmamos com certeza qual valor identifica "o jogador local" de forma estável (o `campo 0` é um ID numérico de sessão/zona, diferente do `CharacterId` — GUID persistente — que o client já rastreia via `opJoin`). Precisa de mais captura controlada para resolver isso (ver seção "Próxima captura recomendada" abaixo).

#### `evCraftItemFinished` — refino de fibra (a sua ação real)
```
0:1056842 1:1413 2:[1057140] 3:[1020] 4:[]byte(len=1) 01
```
Repetido 6x de forma idêntica entre 17:06:57 e 17:06:59 (mesmo ID de item `1057140`, sempre o mesmo byte `01`), sugerindo refino de uma pilha/lote — cada evento parece representar **+1 unidade produzida** no mesmo slot de inventário.

| Campo | Valor observado | Interpretação |
|---|---|---|
| `0` | 1056842 | ID do ator local (numérico, de sessão — não é o `CharacterId` GUID) |
| `1` | 1413 | ID da estação de refino — **bate com o campo `0` do `evCraftBuildingInfo` simultâneo** |
| `2` | `[1057140]` | ID da instância do item resultante (tecido), constante ao longo do lote — parece ser o slot de inventário acumulando quantidade |
| `3` | `[1020]` | ID da matéria-prima usada (T2_FIBER) |
| `4` | 1 byte (`01`) | Provável quantidade produzida nesse tick (+1) |

Quando o lote termina, os campos `3` e `4` vêm vazios (`[]byte{}`), sinalizando fim da sessão:
```
0:1056842 1:1413 2:[1057140] 3:[]byte{} 4:[]byte{}
```

#### `evCraftItemFinished` — evento de outro jogador (minério/barra, NÃO é você)
```
0:1055360 1:1362 2:[1057329] 3:[966 1081] 4:[]byte(len=2) 2a15   (e depois 0603)
```
Ator e estação diferentes do bloco acima — provavelmente outro jogador refinando minério em paralelo, numa estação diferente.

**Atualização (2026-08-21, após analisar `ITEM DUMP.json` — dump oficial `items.xml` da comunidade `ao-bin-dumps`)**: o mistério do array de 2 itens foi **resolvido pela receita real do jogo**, e não tem relação com craft-vs-refino. A receita de refino de **tier 3+** exige estruturalmente 2 ingredientes — a matéria-prima do tier atual **e** o item já refinado do tier anterior. Exemplo real extraído do dump:
```json
// T3_CLOTH (refino T3, 2 ingredientes)
"craftresource": [
  { "@uniquename": "T3_FIBER", "@count": "2", "@enchantmentlevel": "0" },
  { "@uniquename": "T2_CLOTH", "@count": "1", "@enchantmentlevel": "0" }
]
// T2_CLOTH (refino T2, 1 ingrediente só)
"craftresource": { "@uniquename": "T2_FIBER", "@count": "1", "@enchantmentlevel": "0" }
```
Isso bate exatamente com o padrão capturado (`T3_ORE` + `T2_METALBAR` = matéria-prima T3 + barra T2 anterior). Ver [docs/02-dados-de-receita.md](../docs/02-dados-de-receita.md) para o mapeamento completo do formato de receitas.

**O que continua em aberto**: o ator (`1055360`) e a estação (`1362`) desse evento são diferentes dos da sua ação (`1056842`/`1413`) — isso ainda indica que esse evento específico veio de **outro jogador** fazendo um refino de tier 3 por perto, não que a teoria "1 vs 2 itens = craft vs refino" estivesse certa. As duas coisas são independentes: agora sabemos *por que* a receita tem 2 itens (estrutura real do jogo), mas o problema de **filtrar só os seus próprios eventos** (via ator/CharacterId) continua sem solução confirmada — ver "Próxima captura recomendada" abaixo.

#### `evCraftBuildingInfo` — info da estação (durante o refino de fibra acima)
```
0:1413 1:4500000 2:9990000 4:100418444122 6:[]byte{} 7:[]byte{}
```
| Campo | Valor | Interpretação (não confirmada, precisa mais amostras) |
|---|---|---|
| `0` | 1413 | ID da estação (mesmo valor do campo `1` de `evCraftItemFinished`) |
| `1` | 4500000 | Possível valor em prata *10000 (padrão Albion) → 450 prata — pode ser taxa acumulada ou fundo da estação |
| `2` | 9990000 | Idem, *10000 → 999 prata, ou pode ser uma taxa percentual escalada |
| `4` | 100418444122 | Número grande — possível ID/hash da estação ou timestamp, não confirmado |

#### `evCraftingFocusUpdate` — pontos de foco
```
0:1056842 1:36096552 3:25971
```
| Campo | Valor | Interpretação |
|---|---|---|
| `0` | 1056842 | ID do ator (bate com campo `0` do seu refino — dado privado, só chega pro dono) |
| `1` | 36096552 → 36097576 → 36098152 → 36098728 (incrementando) | **Pontos de foco atuais** — como você confirmou que não usou foco, o crescimento aqui é **regeneração passiva** ao longo do tempo, não gasto/ganho ativo |
| `3` | 25971 (constante) | Possível taxa de regeneração por tick |

Como esse evento é privado (só o dono vê seus próprios pontos de foco) e o ator bate exatamente com o ator do seu refino de fibra, isso é uma pista forte de que `1056842` = você. Ainda não é 100% conclusivo — precisa de confirmação cruzando com outro dado inequivocamente "seu" (ex: `CharacterId` do `opJoin`).

Não foram capturados eventos `evRegenerationCraftingChanged` nem as operações `opCraftBuildingChangeSettings`/`opCraftBuildingTakeMoney` nesta sessão — essas exigem ações específicas (as operações de estação exigem ser dono/gerente da estação para ajustar taxas ou sacar dinheiro).

### Próxima captura recomendada (antes de codar os handlers)

Para fechar as dúvidas restantes com confiança, o ideal é uma nova sessão de captura mais controlada:
1. **Craft real** (ainda não testamos) — craftar um item conhecido e comparar o payload com o refino já capturado.
2. **Confirmar identidade do ator local** — comparar o `campo 0` do `evCraftItemFinished`/`evCraftingFocusUpdate` com o `CharacterId` (GUID) que o client já resolve via `opJoin` (`client/operation_join.go`), adicionando um log temporário que imprima `state.CharacterId` ao lado do ator capturado, para confirmar (ou não) que são a mesma entidade por outro caminho.
3. **Refino de quantidade conhecida** (ex: refinar exatamente 10 unidades) e contar quantos eventos `evCraftItemFinished` chegam, para confirmar se o byte do campo `4` é mesmo "quantidade por tick".
4. Se possível, testar **sozinho, longe de outros jogadores** (estação privada em hideout, por exemplo) para eliminar o ruído de eventos de terceiros.

### Passo 2 — Ligar os handlers em `client/decode.go`
Adicionar `case` para cada código confirmado na função `decodeEvent` (hoje só trata 2 casos).

### Passo 3 — Criar os structs de evento
Novos arquivos `client/event_craft_item_finished.go` etc., seguindo o padrão de `client/event_festivities_update.go`: campos com tags `mapstructure:"<paramKey>"` batendo com o observado no passo 1, implementando `Process(state *albionState)`.

### Passo 4 — Novos DTOs de upload
Em `lib/` (ex: `lib/craft.go` com `CraftEventUpload`), e nova constante de tópico em `lib/nats.go` (ex: `NatsCraftEventIngest = "craftevents.ingest"`), seguindo o padrão de `lib/festivities.go`.

### Passo 5 — Disparar upload
Dentro do `Process()`, chamar `sendMsgToPublicUploaders`/`sendMsgToPrivateUploaders` (`client/dispatcher.go`) com o novo tópico. **Nenhuma mudança é necessária na camada de captura de pacotes nem no parser Photon** — eles já entregam todos os eventos; só a camada de decode/dispatch precisa ser estendida.

### Passo 6 — Consumir no Albion Profit Pro
Habilitar o WebSocket local (seção 7) e assinar `ws://localhost:8099/ws`, filtrando pelos novos tópicos de craft/refino — evita depender do ingest remoto e do desafio de Proof-of-Work.

### Arquivos críticos
- `client/decode.go` — dispatch central (onde adicionar os `case`)
- `client/events.go` / `client/operations.go` — enums com os códigos já existentes
- `client/event_festivities_update.go` — melhor exemplo de padrão a seguir
- `client/event_skill_data.go` — exemplo de handler pronto mas desconectado (referência de "como religar")
- `lib/nats.go`, `lib/festivities.go` — padrão de DTO + tópico
- `client/dispatcher.go` — onde o upload é efetivamente enviado
- `client/debug_format.go` — como os parâmetros brutos são logados para descoberta de payload
- `config.yaml.example`, `client/ws_hub.go`, `client/ws_client.go` — WebSocket local

### Verificação
1. Rodar com `-de`/`-do` nos códigos listados, confirmar payloads reais de craft/refino no log.
2. Após implementar: `go build ./...` dentro de `albiondata-client/` para garantir que compila.
3. Teste manual em jogo (craft/refino real), verificando no log ou no WebSocket local que o novo tópico é publicado com os dados esperados.

---

## 9. Armadilhas operacionais confirmadas ao vivo (2026-08-22)

Descobertas rodando o client de verdade contra o jogo, numa sessão de captura com sink HTTP
local. Detalhe dos dados em [03-contrato-ingest-real.md](03-contrato-ingest-real.md); aqui fica
o que é sobre o **funcionamento do client**.

### 9.1. O client descarta tudo até ver uma transição de zona

Este é o mais importante para o produto. Todo handler de mercado começa com:

```go
if !state.IsValidLocation() {
    return
}
```

A localização só é aprendida quando o jogador **muda de zona** com o client já rodando. Se o
client for iniciado com o personagem parado dentro da cidade, `IsValidLocation()` é falso e
**nada sobe** — o mercado é aberto, os dados chegam, são decodificados corretamente, e são
descartados. O único sinal é uma linha de erro no log:

```
The players location has not yet been set. Please transition zones so the location can be identified.
```

Aconteceu na primeira tentativa desta captura: as opcodes casaram, o parsing funcionou, o
histórico foi decodificado — e o sink recebeu zero payloads de mercado.

**Implicação de produto (Fase 2/3):** o usuário final vai bater nisso e vai concluir que o
sistema não funciona. Precisa de detecção explícita do estado "sem localização" e um aviso
ativo, não um erro no log.

> ✅ **Tratado na [task 05](tasks/client/05-aviso-de-localizacao.md) (2026-08-23).** Correção do
> texto acima: o aviso ativo **já existia** no upstream (`notification.Push` dentro de
> `IsValidLocation`) — o problema era o oposto de "não avisa". Sem debounce nenhum, disparava uma
> notificação nativa do SO **por pacote rejeitado**, e era suprimida justamente sob `-debug`. A
> task adicionou janela de 60s, removeu a supressão e tornou a mensagem acionável.
>
> **Achado novo da mesma task:** `normalizeLocationID` (`client/listener.go`) e
> `IsValidLocation` (`client/albion_state.go`) discordam sobre o que é localização aceitável.
> Quatro formatos de **ilha** (`@island@<guid>`, `island-player-*`, `@player-island*`,
> `@island-*`) passam pela normalização e são rejeitados pela validação — ou seja, dentro de uma
> ilha nenhuma transição de zona resolve, porque a localização *está* setada. Impacto prático
> baixo (ilha não tem mercado), decisão de produto em aberto, comportamento travado por teste em
> `client/albion_state_location_test.go`.

### 9.2. `log.Fatal` num payload inesperado derrubava o client inteiro

`client/operation_auction_get_offers.go:47` chamava `log.Fatal(err2)` quando uma entrada do
livro não era JSON válido. Aconteceu de verdade: uma resposta na opcode 81 trouxe
`["Westweald Shore Foss"]` no lugar das ordens, e o processo **morreu** com
`invalid character 'W' looking for beginning of value`.

O handler irmão de *requests* (`operation_auction_get_requests.go:29`) já tratava o mesmo erro
com `log.Errorf` e seguia. Era inconsistência do upstream, não decisão de projeto.

**Patch local aplicado** (marcado com o comentário `PATCH LOCAL` no arquivo): loga e pula a
entrada, em vez de matar o processo. Rebuild com Go 1.27. Avaliar enviar como PR pro upstream.

> Observação: o flag `-ignore-decode-errors` **não** cobre esse caso — ele só atua na camada
> Photon (`client/listener.go`), não no `json.Unmarshal` dos handlers.

### 9.3. A tabela de opcodes NÃO derivou

Preocupação inicial (o enum de `client/operations.go` é `iota` puro — uma opcode a mais num
patch do jogo desloca todas as seguintes) foi **descartada com dado real**:

| Opcode | Nome no client | Confirmado no tráfego |
|---|---|---|
| 81 | `opAuctionGetOffers` | ✅ requisição com `8:[1020]`, categoria `crafting/resources/fiber` |
| 82 | `opAuctionGetRequests` | ✅ |
| 95 | `opAuctionGetItemAverageStats` | ✅ com `Timescale` 0, 1 e 2 |

Não há trabalho de re-mapeamento pendente para os dados de mercado.

### 9.4. Como capturar (receita que funciona)

```bash
# sink local que grava cada POST em disco -- ver backend/scripts/capture_sink.py (task 36)
python backend/scripts/capture_sink.py

# client apontado pro sink. NAO usar -d.
cd albiondata-client
./albiondata-client.exe -i http://localhost:9099 -debug
```

- **`-d` não serve para inspecionar payload.** Com `-d`, `sendMsgToUploaders`
  (`client/dispatcher.go`) só loga `"Upload is disabled."` e retorna, sem enviar nada. Para ver
  os dados, é preciso um destino real; substituir o `-i` por um sink local mantém tudo offline
  sem tocar no ingest público (o canal privado `-p` já é vazio por default).

  > ⚠️ **Correção (2026-08-23, achado `F6`):** a versão anterior desta nota dizia que com `-d`
  > "o JSON nunca é serializado". Isso vale só pro caminho **privado**
  > (`sendMsgToPrivateUploaders` checa `DisableUpload` antes de marshalar). No caminho
  > **público** o `json.Marshal` roda logo na entrada de `sendMsgToPublicUploaders`, e os
  > uploaders chegam a ser construídos — só o envio final é pulado. A conclusão prática
  > (`-d` não serve pra inspecionar payload) continua valendo; o mecanismo é que era outro.
- **Não precisa de privilégio de administrador** nesta máquina — o Npcap está em modo
  compatível e o client abriu as interfaces normalmente com usuário comum.
- Depois de subir o client, **atravessar uma passagem de zona** antes de abrir o mercado
  (ver 9.1).
