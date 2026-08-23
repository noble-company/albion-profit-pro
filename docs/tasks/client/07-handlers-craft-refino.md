# 07 — Handlers de craft/refino no client

> # ❌ DESCOPADA (2026-08-23) — não implementar
>
> A calculadora é ferramenta de **planejamento**: taxa de estação, taxa de retorno e quantidade a
> produzir são **informadas pelo jogador**. Nenhum insumo do cálculo vem de evento de craft, então
> esta task não alimenta nada. Racional completo em [README.md](README.md#por-que-07-09-foram-descopadas-2026-08-23).
>
> A spec fica no repositório porque o protocolo está todo mapeado
> ([doc 03 §8b](../../03-contrato-ingest-real.md)) — se um dia fizer sentido, é só implementar.

## Objetivo
Ligar os eventos de craft/refino no `decodeEvent` e criar os structs que os decodificam — incluindo
o filtro que garante que só os eventos **do próprio jogador** contam.

## Por que

`client/decode.go` define ~695 códigos de evento em `client/events.go`, mas `decodeEvent` trata
**dois**:

```go
	switch EventType(eventType) {
	// case evRespawn: //TODO: confirm this eventCode (old 77)
	// 	event = &eventPlayerOnlineStatus{}
	// case evCharacterStats: //TODO: confirm this eventCode (old 114)
	// 	event = &eventSkillData{}
	case evRedZoneWorldMapEvent:
		event = &eventRedZoneWorldMapEvent{}
	case evFestivitiesUpdate:
		event = &eventFestivitiesUpdate{}
	default:
		return nil, nil
	}
```

Todo o resto cai no `default` e é descartado em silêncio. Os eventos de craft chegam, são
decodificados pelo parser Photon corretamente, e são jogados fora.

Note os dois `case` comentados: são handlers **completos** desligados porque o código do evento não
foi reconfirmado depois de um patch do jogo. Esse é o padrão de extensão do projeto — o trabalho
real é confirmar o código e ligar o `case`, não escrever o decodificador do zero. A task 06 já fez
a parte de confirmar.

**Nada muda na camada de captura de pacote nem no parser Photon** — eles já entregam todos os
eventos. Só decode e dispatch precisam ser estendidos.

## O que implementar

> ✅ **Task 06 concluída (2026-08-23)** — resultados em
> [doc 03 §8b](../../03-contrato-ingest-real.md). O que mudou nesta spec:
>
> - **O evento principal passa a ser `evCraftBuildingInfo` (49)**, não o `evCraftItemFinished`
>   (71). É ele que carrega a taxa de uso da estação — o dado que a calculadora precisa (ver
>   [task 09](09-backend-ingest-craft.md), seção "Por que"). O `71` continua sendo capturado, mas
>   pelo motivo revisado abaixo.
> - **O filtro "isso sou eu" está resolvido**: `evCraftingFocusUpdate` (10) é privado e identifica
>   o ator local. **O ID do ator é efêmero e muda a cada transição de zona** — precisa ser
>   reaprendido no `opJoin`, nunca persistido.
> - **Campo 4 = quantidade devolvida** (não produzida nem consumida), paralela ao campo 3, que são
>   os **itens devolvidos**. Campos 3 e 4 vazios = craft sem devolução, **não** "fim de lote".
> - **Não há um evento por unidade** — uma ação de refino de 10 fibras gera **um** evento.
> - **Craft e refino são o mesmo evento**, mesma estrutura. Um handler atende os dois.
>
> **Por que o `71` ainda importa, já que a quantidade produzida é irrelevante:** ele é o que amarra
> o jogador a uma estação (`evCraftBuildingInfo` traz a taxa mas não diz quem usou) e o que dá a
> taxa de retorno observada. Sem ele, teríamos taxas de estação sem saber de qual cidade ou
> contexto vieram.

### Structs de evento

Um arquivo por evento, seguindo `client/event_festivities_update.go` — o melhor exemplo do repo:

```go
type eventCraftItemFinished struct {
	ActorId   int      `mapstructure:"0"`
	StationId int      `mapstructure:"1"`
	ItemIds   []int    `mapstructure:"2"`
	// ... conforme confirmado na task 06
}

func (event eventCraftItemFinished) Process(state *albionState) {
	// filtro "isso sou eu" ANTES de qualquer coisa
	// montagem do upload
	// sendMsgToPublicUploaders(...)  -> task 08
}
```

Arquivos: `client/event_craft_item_finished.go` e, conforme o escopo decidido na task 06,
`client/event_craft_building_info.go` / `client/event_crafting_focus_update.go`.

Duas coisas a copiar do `eventFestivitiesUpdate`:

1. **Validação antes de subir.** O método `upload()`
   (`client/event_festivities_update.go:43-75`) confere consistência de tamanho de array e valores
   plausíveis, devolvendo `error` em vez de mandar lixo pro ingest. Os arrays do
   `evCraftItemFinished` (campos `2` e `3`) têm o mesmo risco.
2. **Debounce por tempo**, se a task 06 confirmar que refino dispara um evento por unidade — 6
   eventos idênticos em 2 segundos foi o observado. `albionState` já tem o padrão
   (`BanditEventLastTimeSubmitted`/`FestivitiesLastTimeSubmitted`, `client/albion_state.go:31-32`).
   **Mas atenção:** debounce cego perde contagem de produção, que é justamente o dado que queremos.
   Preferir **agregar** o lote (acumular até o marcador de fim de lote — campos `3` e `4` vazios —
   e subir uma vez com o total) a simplesmente descartar repetido. Decidir com o dado da task 06.

### O filtro "isso sou eu" — o coração da task

Implementar a estratégia decidida na task 06. Seja qual for, ela precisa de:

- **Falhar fechado**: na dúvida sobre a identidade, **não** subir o evento. Perder um craft do
  usuário é irritante; ingerir o craft de um estranho corrompe o cálculo de lucro dele.
- **Log explícito de descarte** (em debug), pra dar como diagnosticar quando alguém reclamar que
  o craft não apareceu. Mesmo espírito do achado `A5` da revisão do backend: dado descartado em
  silêncio é dívida.
- Estado no `albionState` se a estratégia exigir aprender o ator local em runtime.

### Ligar no `decodeEvent`

`client/decode.go`, adicionar os `case` no switch. Os códigos vêm de `client/events.go` — usar
**as constantes**, nunca o número cru (o enum é `iota` puro; um opcode a mais num patch do jogo
desloca todos os seguintes, e a constante acompanha, o número não).

O doc 01 §9.3 confirmou que a tabela de opcodes **não** derivou pros dados de mercado; os códigos
de craft foram confirmados na captura de 2026-08-21 e reconfirmados na task 06.

## Bibliotecas/dependências
Nenhuma nova. `mapstructure` já é usado pelo decode (`client/decode.go`), `uuid` já é usado pelos
handlers existentes.

## Depende de
**Task 06** (bloqueante — payload, semântica dos campos e estratégia de filtro).

A chamada de upload em si (`sendMsgToPublicUploaders`) é da **task 08**; esta task pode deixar o
`Process` montando a struct e logando, com o envio ligado na 08.

## Testes manuais
1. `go build ./...`.
2. Rodar com `-events "71" -debug` e refinar algo → o handler novo é atingido (log confirma), em
   vez do evento cair no `default`.
3. Se possível, com outro jogador craftando por perto: confirmar que o evento dele é **descartado**
   pelo filtro e que o descarte aparece no log de debug.
4. Refinar um lote conhecido e conferir que a contagem agregada bate com o que foi produzido.

## Testes automatizados
`client/event_festivities_update_test.go` é o modelo — testa `Process`/`upload` com params
sintéticos, sem rede.

- Decode: `map[uint8]interface{}` com os valores **reais capturados na task 06** → struct com os
  campos certos. Usar a fixture da 06, não valores inventados (é exatamente o erro que a Fase 1.5
  do backend existiu pra corrigir).
- Filtro: evento com ator do jogador local → aceito; evento com ator diferente → descartado.
- Filtro com identidade local ainda desconhecida → descartado (falha fechado).
- Arrays inconsistentes (tamanhos diferentes entre campos `2` e `3`) → erro, não upload.
- Marcador de fim de lote (campos `3`/`4` vazios) → fecha o lote, não vira evento de produção.
- Agregação: N eventos de +1 unidade → um upload com total N (se for essa a decisão da task 06).
