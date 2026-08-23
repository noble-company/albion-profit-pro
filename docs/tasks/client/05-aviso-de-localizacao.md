# 05 — Consertar o aviso de localização

> Corrige o achado **N6** de [../../00-plano-macro.md](../../00-plano-macro.md) e o **F3** de
> [README.md](README.md).

## Objetivo
Transformar o aviso de "sem localização" de uma tempestade de notificações (suprimida justamente
quando o desenvolvedor está olhando) em **um** aviso acionável, e resolver o descasamento de
validação que faz ilha descartar dado pra sempre.

## Por que

### O aviso já existe — e do jeito errado (achado F3)

O plano macro descreve o `N6` como algo que "precisa de tratamento de produto: detectar o estado e
avisar na bandeja/UI". Lendo o código, **o aviso já está lá** desde o upstream
(`client/albion_state.go:42-68`):

```go
func (state albionState) IsValidLocation() bool {
	var onlydigits = regexp.MustCompile(`^[0-9]+$`)

	switch {
	case state.LocationId == "":
		log.Error("The players location has not yet been set. Please transition zones so the location can be identified.")
		if !ConfigGlobal.Debug {
			notification.Push("The players location has not yet been set. ...")
		}
		return false
	// ...
```

Três problemas, todos visíveis nesse trecho:

1. **Zero rate-limit.** `IsValidLocation()` é chamado no `Process` de cada resposta de mercado, e
   `client/router.go:52` dispara uma goroutine por operação. Um jogador parado no mercado com a
   localização não resolvida gera **uma notificação nativa do sistema operacional por pacote
   rejeitado**. Não é um aviso, é um ataque de negação de serviço contra o próprio usuário.
2. **Suprimido sob `-debug`.** A condição é `if !ConfigGlobal.Debug` — ou seja, quem está
   depurando (a pessoa com maior chance de agir sobre o aviso) é exatamente quem **não** o vê. Foi
   provavelmente uma tentativa de conter o problema 1, tratando o sintoma.
3. **Receiver por valor.** `func (state albionState) IsValidLocation()` copia o struct inteiro a
   cada chamada — inclusive `marketHistoryIDLookup [8192]marketHistoryInfo`
   (`client/albion_state.go:38`). Além do custo por evento num caminho quente, isso torna
   **impossível** memoizar "já avisei" dentro do método: qualquer campo escrito morre com a cópia.

### O descasamento de validação

Duas funções decidem o que é localização válida, com regras diferentes:

- `normalizeLocationID` (`client/listener.go:279-302`) é o portão de entrada — só deixa passar
  GUID de ilha, `^[0-9]{3,6}$`, ou os sufixos/prefixos conhecidos. O que não passa vira `""` e a
  localização **nunca é setada** (os dois únicos escritores são
  `client/operation_join.go:26-32` e `client/operation_get_game_server_by_cluster.go:12-20`, ambos
  passando por ela).
- `IsValidLocation` aceita `^[0-9]+$` (**qualquer** comprimento) e rejeita no `default` tudo que
  não casar com os quatro casos.

O resultado prático a confirmar: `@ISLAND@<guid>` **passa** pela normalização (vira `LocationId`)
mas cai no `default` de `IsValidLocation` — então dentro de ilha o client descarta todo dado de
mercado **e** dispara a notificação de "localização inválida", pra sempre, sem transição de zona
nenhuma resolver. Se confirmado, é um bug de produto real, não só ruído.

## O que implementar

### Receiver por ponteiro

```go
func (state *albionState) IsValidLocation() bool {
```

Os três call sites já operam sobre `*albionState` (o `Process(state *albionState)` recebe
ponteiro), então a mudança é transparente pra eles:

- `client/operation_auction_get_offers.go:36`
- `client/operation_auction_get_requests.go:18`
- `client/operation_auction_get_item_average_stats.go:78`

Confirmar com `go build ./...` que não há outro chamador operando sobre valor.

### Debounce, com o precedente que já existe no struct

`albionState` já tem exatamente esse padrão pra dois casos
(`client/albion_state.go:31-32`):

```go
	BanditEventLastTimeSubmitted time.Time
	FestivitiesLastTimeSubmitted time.Time
```

E `eventFestivitiesUpdate.Process` mostra o uso (`client/event_festivities_update.go:26-28`):

```go
	if !state.FestivitiesLastTimeSubmitted.IsZero() && time.Since(state.FestivitiesLastTimeSubmitted).Seconds() < 60 {
		return
	}
```

Seguir o mesmo formato — campo novo `LocationWarningLastSentAt time.Time`, janela de 60s aplicada
**à notificação**. O `log.Error` pode continuar a cada ocorrência (é arquivo, não interrompe
ninguém) ou também ser debounçado; decidir na implementação e registrar o porquê no comentário.

### Parar de suprimir sob `-debug`

Remover as duas condições `if !ConfigGlobal.Debug` (linhas 48 e 63). Com o debounce no lugar, a
razão de existirem desaparece.

### Mensagem acionável

As mensagens atuais descrevem o estado interno ("The players location has not yet been set"), não o
que fazer. Trocar por instrução direta, no idioma do projeto — algo como *"atravesse uma passagem
de zona pra ativar a coleta de dados"*. `notification.Push(msg string)`
(`notification/notification_win.go`, `notification/notification_nix_darw.go`) já fixa
título/AppID como "Albion Data Client"; só o corpo é nosso.

### Investigar o caso da ilha

Antes de mexer nas regras: confirmar empiricamente, com o client rodando dentro de uma ilha, qual
`LocationId` de fato chega. Duas saídas possíveis:

- Se ilha realmente sempre descarta → decidir se ilha entra como localização válida (tem mercado?)
  ou se o aviso deve dizer que ilha não coleta, em vez de mandar o usuário trocar de zona à toa.
- Se não reproduzir → registrar o resultado e **não** mexer nas regras de validação.

Em qualquer dos casos, o achado vai pro `docs/01-mapeamento-albiondata-client.md` §9 (é sobre o
funcionamento do client), conforme a convenção do `docs/README.md`.

> Esta investigação é a parte de maior incerteza da task. Se ela crescer, vale quebrar numa task
> própria em vez de inchar esta — o conserto do debounce (que é o valor principal) não depende dela.

### Opcional, se a task 04 já estiver pronta

Chamar `GET /client/me` no boot e avisar de forma igualmente clara quando o token for inválido.
São os dois modos de falha silenciosa que produzem o mesmo sintoma ("não aparece nada no site"), e
resolver os dois na mesma camada de aviso é natural. Se a task 04 ainda não estiver pronta, isso
fica pra task 10 — não bloquear esta.

## Bibliotecas/dependências
Nenhuma nova. `time` é stdlib e já é importado em `client/albion_state.go:6`.

## Depende de
Nada (paralelo às tasks 01-03). A parte opcional depende da task 04.

## Testes manuais
1. `go build ./...`.
2. Iniciar o client com o personagem **parado** numa cidade (sem transição de zona), abrir o
   mercado no jogo e confirmar: **uma** notificação, não uma por pacote.
3. Repetir com `-debug` → a notificação continua aparecendo (antes era suprimida).
4. Atravessar uma passagem de zona → dado passa a subir, sem mais avisos.
5. Entrar numa ilha e registrar qual `LocationId` chega (ver "Investigar o caso da ilha").
6. Esperar >60s no estado ruim → um novo aviso é emitido (o debounce é janela, não "avisa só uma
   vez e cala pra sempre").

## Testes automatizados
- `IsValidLocation` com `LocationId == ""` → `false`, e chamadas repetidas dentro da janela não
  disparam notificação de novo. Vai precisar de um ponto de injeção pro `notification.Push`
  (variável de pacote substituível no teste) — hoje é chamada direta, não é testável.
- Passada a janela → notifica de novo.
- Cada formato **válido** (`"1002"`, `"BLACKBANK-x"`, `"x-HellDen"`, `"x-Auction2"`) → `true`, sem
  notificação nenhuma.
- Formato inválido → `false` + notificação (respeitando o mesmo debounce).
- Tabela cruzando `normalizeLocationID` × `IsValidLocation` com os formatos reais medidos
  (`docs/03-contrato-ingest-real.md` §4), afirmando o comportamento decidido pra ilha — este é o
  teste que trava o achado pra não regredir.

---

## Notas de implementação (2026-08-23) — task concluída

### O descasamento das ilhas foi provado **estaticamente**, sem precisar do jogo

A spec propunha investigar em jogo. Não foi necessário: lendo `normalizeLocationID`
(`client/listener.go`) lado a lado com `IsValidLocation`, o descasamento é demonstrável por
tabela. São **quatro** formatos que a normalização deixa passar (viram `LocationId` de verdade) e
a validação depois rejeita no `default`:

| Formato bruto | `normalizeLocationID` | `IsValidLocation` |
|---|---|---|
| `@island@<guid>` | ✅ vira `@ISLAND@<guid>` | ❌ rejeita |
| `island-player-*` | ✅ passa | ❌ rejeita |
| `@player-island*` | ✅ passa | ❌ rejeita |
| `@island-*` | ✅ passa | ❌ rejeita |

Consequência: dentro de uma ilha o client descarta dado de mercado **e** avisa, e **nenhuma
transição de zona resolve** — a localização *está* setada, só não é "válida". O aviso antigo
("atravesse uma zona") era ativamente enganoso nesse caso.

**Impacto prático é baixo**, e vale registrar por quê: ilha de jogador não tem mercado, então
resposta de mercado não chega lá e os 3 call sites de `IsValidLocation` não são atingidos. É uma
inconsistência real de lógica, com pouca consequência observável.

**A decisão de produto ficou deliberadamente em aberto** — ilha deveria ser válida, ou a mensagem
deveria dizer que ali não se coleta? Responder exige confirmar em jogo **qual** dos quatro
formatos de fato aparece, e a spec é explícita: *"Se não reproduzir → registrar o resultado e não
mexer nas regras de validação."* Não mexi. O teste
`TestDescasamentoEntreNormalizacaoEValidacao` congela o comportamento atual, então a decisão pode
ser tomada depois sem risco de alguém "consertar" por simetria sem perceber.

Descoberta lateral da mesma tabela: **`3005@1` (rest/smuggler den, formato medido no
doc 03 §4) não passa por `normalizeLocationID`**. Não é um problema — esse formato chega pelo
próprio payload da ordem, não pelo `state` (ver o tratamento de `@` em
`operation_auction_get_offers.go`) — mas é bom estar travado por teste.

### Outras decisões

- **Injeção pra teste**: `notification.Push` é chamada direta e não é observável de um teste.
  Virou a variável de pacote `pushNotification`, que o teste substitui por um contador.
- **O log continua a cada ocorrência**, só a notificação é debouncada. Log vai pra arquivo e não
  interrompe ninguém; a contagem ajuda a dimensionar por quanto tempo o client ficou descartando.
- **Mensagens mantidas em inglês**, como todo o resto da UI do client (systray, logs do upstream).
  Misturar idioma seria pior que traduzir tudo — se um dia traduzirmos, é uma passada só.
- **`GetServer` continua com receiver por valor** (`albion_state.go`), agora divergindo de
  `IsValidLocation`. Receiver misto no mesmo tipo é cheiro de estilo, e `GetServer` paga a mesma
  cópia do array de 8192 posições — mas ele não muta nada e trocar seria refatoração oportunista,
  fora do escopo. Fica anotado.
- **A parte opcional da spec** (chamar `GET /client/me` no boot) **não foi feita** — ver
  "Pendente" no relatório. A task 04 entregou o endpoint; ligá-lo no client é trabalho de client,
  e cabe melhor na task 10, junto da validação ponta a ponta.
