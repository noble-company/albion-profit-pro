# 06 — Sessão de captura controlada de craft/refino

> Fecha as perguntas em aberto de
> [../../01-mapeamento-albiondata-client.md](../../01-mapeamento-albiondata-client.md) §8.

## Objetivo
Responder, com dado medido no jogo, as quatro perguntas que faltam antes de escrever qualquer
handler de craft/refino. **O entregável é documentação e fixtures, não código de produção.**

## Por que

A captura de 2026-08-21 (doc 01 §8) já resolveu bastante: os códigos de evento estão confirmados,
o formato geral do `evCraftItemFinished` está mapeado, e o mistério do "array de 2 itens" foi
explicado pela estrutura real das receitas de tier 3+ (`docs/02-dados-de-receita.md`).

Mas ela deixou **uma pergunta que bloqueia tudo**:

> O client fareja todo o tráfego da interface de rede — não só as suas ações. Naquela sessão, dos
> dois blocos de refino capturados, **um não era do usuário**: ator `1055360`, estação `1362`,
> outro jogador refinando minério por perto. E o primeiro evento capturado era um item de **peixe**,
> sem relação nenhuma com craft.

Sem saber distinguir "isso sou eu" de "isso é o vizinho", qualquer handler que a gente escreva vai
**ingerir craft de estranhos como se fosse do usuário** — e a calculadora vai reportar lucro de uma
produção que nunca aconteceu. Isso é pior que não ter a feature: é dado errado apresentado com
confiança.

A pista mais forte que temos é que `evCraftingFocusUpdate` (evento privado — só o dono vê os
próprios pontos de foco) traz o ator `1056842`, o mesmo do refino que o usuário confirmou ter feito.
Forte, mas **não conclusivo** — precisa ser confirmado por outro caminho.

Chutar aqui sai caro: o handler é fácil de escrever e difícil de validar depois, porque o erro só
aparece quando tem outro jogador por perto.

## O que investigar

### (a) Identidade do ator local — a pergunta que bloqueia

O campo `0` do `evCraftItemFinished` é um ID numérico de sessão/zona. O client já rastreia um
`CharacterId` (GUID persistente, `lib.CharacterID`) resolvido via `opJoin`
(`client/operation_join.go`) e guardado em `albionState.CharacterId`
(`client/albion_state.go:25`). São coisas diferentes — a questão é se dá pra ligar uma na outra.

Método: log temporário (**não commitar**) que imprima, lado a lado, `state.CharacterId`,
`state.CharacterName` e o campo `0` de cada `evCraftItemFinished`/`evCraftingFocusUpdate` recebido.
Depois, refinar algo sozinho e comparar.

Saídas possíveis, todas aceitáveis como resultado:
- Existe um campo no `opJoin` (ou noutro evento) que casa com o ator numérico → **é o filtro**.
- Não casa, mas `evCraftingFocusUpdate` é comprovadamente privado → dá pra aprender o ator local
  observando o primeiro `evCraftingFocusUpdate` da sessão e guardá-lo no `albionState`.
- Nenhum dos dois → registrar o impasse. A task 07 então precisa de outra estratégia (ex: só aceitar
  eventos cuja estação bata com a estação onde o jogador interagiu), ou a feature fica bloqueada
  até nova captura. **Documentar um impasse é um resultado válido desta task.**

### (b) Craft de verdade (nunca foi capturado)

A sessão anterior só fez **refino de fibra**. Nunca vimos um craft de item (arma, armadura,
consumível). Capturar um craft conhecido e comparar campo a campo com o refino: mesmo evento? mesmos
campos? algum campo novo aparece (qualidade, encantamento, foco gasto)?

### (c) Semântica do campo `4`

No refino capturado, o campo `4` era 1 byte (`01`) e o evento se repetiu 6× idêntico. A hipótese é
"+1 unidade produzida por tick". Testar refinando uma **quantidade conhecida** (ex: exatamente 10
unidades) e contando os eventos. Se 10 unidades → 10 eventos com `01`, hipótese confirmada. Se
vier `0a` (10) num evento só, é quantidade total. Testar também um lote grande o bastante pra
passar de 255 e ver se o campo cresce pra 2 bytes (o bloco do outro jogador tinha
`[]byte(len=2) 2a15`).

Confirmar também o marcador de fim de lote (campos `3` e `4` vazios), já observado.

### (d) Ruído de terceiros

Rodar **sozinho**, longe de outros jogadores — estação privada em hideout é o ideal. Isso dá um
conjunto de dados limpo pra comparar contra a captura anterior (que tinha ruído), e é o que valida
o filtro de (a): com o filtro aplicado ao dado ruidoso da captura antiga, tudo que não é do usuário
tem que sumir.

### (e) Foco e taxa de estação — oportunista

`evCraftingFocusUpdate` (campo `1`) e `evCraftBuildingInfo` (campos `1` e `2`, provavelmente prata
×10.000 conforme o padrão do achado `N1`) são interpretações **não confirmadas**. Se a sessão der
margem, medir: gastar foco de propósito e ver o campo `1` cair; craftar numa estação com taxa
conhecida e conferir se o valor bate. Não bloqueia as outras tasks — é bônus que melhora o cálculo
de lucro depois.

## Como capturar

Os códigos numéricos já foram resolvidos (contando a posição no bloco `iota` de
`client/events.go`/`client/operations.go`) — **as flags `-events`/`-operations` esperam o ID
numérico, não o nome**:

| Código | Constante |
|---|---|
| 10 | `evCraftingFocusUpdate` |
| 49 | `evCraftBuildingInfo` |
| 71 | `evCraftItemFinished` |
| 94 | `evRegenerationCraftingChanged` |
| 47 | `opCraftBuildingChangeSettings` |
| 48 | `opCraftBuildingTakeMoney` |

```bash
cd albiondata-client
./albiondata-client.exe -events "10,49,71,94" -operations "47,48" -debug -d
```

`-d` é apropriado **aqui**: esses eventos não têm handler, então não há upload nenhum a inspecionar
— o dado aparece no log via `client/debug_format.go`. (Isso é diferente do caso de payload de
mercado, onde `-d` não serve e é preciso um sink real — ver doc 01 §9.4.)

Continua valendo a armadilha do `N6`: **atravessar uma passagem de zona** com o client já rodando
antes de qualquer coisa (doc 01 §9.1).

## Bibliotecas/dependências
Nenhuma. Não há código de produção nesta task.

## Depende de
Nada tecnicamente. Na prática, fazer **depois** da task 05 deixa a sessão menos irritante (sem
tempestade de notificação enquanto a localização não resolve).

**Bloqueia as tasks 07, 08 e 09** — todas dependem do payload confirmado aqui.

## Entregáveis

1. **`docs/03-contrato-ingest-real.md`** — seção nova com o payload de craft/refino medido, no
   mesmo formato das seções existentes (tabela campo a campo, valores reais observados, o que é
   medido vs. o que é inferido). O doc 03 tem precedência sobre suposição, então é ali que o dado
   medido mora.
2. **`docs/01-mapeamento-albiondata-client.md` §8** — atualizar com a resposta de (a), que é sobre
   o funcionamento do client.
3. **Fixtures em `backend/tests/fixtures/wire/`** — se a captura produzir payload de upload; senão,
   o log bruto anonimizado, pra servir de base aos testes das tasks 07 e 09.
4. **Decisão explícita sobre o filtro "isso sou eu"**, escrita na spec da task 07 antes de ela
   começar.

## Testes manuais
A task inteira é teste manual. Roteiro na ordem:

1. Client rodando, atravessar zona.
2. Refinar 10 unidades de um material conhecido, sozinho → contar eventos (pergunta (c)).
3. Craftar um item conhecido → comparar com o refino (pergunta (b)).
4. Conferir ator/estação em todos os eventos contra `CharacterId` (pergunta (a)).
5. Se possível, repetir perto de outros jogadores e confirmar que o filtro proposto separa os dois
   conjuntos (pergunta (d)).

## Testes automatizados
Nenhum — não há código de produção. Os testes que **derivam** desta captura ficam nas tasks 07
(decode dos campos) e 09 (schema do backend), usando as fixtures que ela produzir.

---

## Resultado (2026-08-23) — task concluída

Duas sessões: uma não controlada (cidade cheia, boa pro achado de identidade) e uma **controlada**
com entrada exata e screenshot do jogo confirmando cada número. Logs brutos em `docs/capturas/`.
Achados completos em [03-contrato-ingest-real.md §8b](../../03-contrato-ingest-real.md).

### (a) Identidade do ator local — ✅ **RESOLVIDO**

`evCraftingFocusUpdate` (10) é privado e isola o jogador local. Numa cidade com **544 personagens
em cena** e **14 atores distintos** emitindo `evCraftItemFinished`, **apenas 2** receberam evento
de foco — os 2 correspondendo exatamente às ações que o jogador acabara de fazer.

Dois cuidados que a task 07 precisa respeitar:
- **O ID do ator muda a cada transição de zona** (`113761` → `117239` → `129436`, mesmo
  personagem). É ID de sessão: reaprender a cada `opJoin`, nunca persistir.
- **`evNewCharacter` (29) não serve de ponte** — dispara para *outros* jogadores, nunca para o
  próprio. Testado: nem nome nem GUID do jogador local aparecem nos 544 eventos.

### (b) Craft difere de refino? — ✅ **NÃO**

Estrutura idêntica. Só mudam estação e itens. **Um handler atende os dois.**

### (c) Campo 4 — ✅ **RESOLVIDO, e não era o que se supunha**

Não é quantidade produzida nem consumida: é a **quantidade devolvida** pela taxa de retorno,
paralela ao campo 3 (que são os **itens devolvidos**, não os ingredientes).

Medição controlada: 10× T2_FIBER, retorno 36,7%, sem foco → 10 tecidos e **4 Algodões
devolvidos**; o fio trouxe **um** evento com `3:[1020] 4:[04]`.

> ⚠️ **Consequência que muda o escopo das tasks 07-09:** o evento **não carrega a quantidade
> produzida**. Diz que houve craft, onde, e o que foi devolvido — mas não quanto saiu. Antes de
> modelar a tabela na task 09, é preciso decidir: inferir pela receita + entrada, procurar outro
> evento que carregue a quantidade, ou aceitar registrar só devolução (o que ainda tem valor:
> taxa de retorno real é fator de lucro).

### (d) Ruído de terceiros — ✅ medido

Não foi possível rodar sozinho, o que na prática **fortaleceu** o resultado: o filtro de (a) foi
validado justamente no pior cenário. 12 dos 14 atores descartados corretamente.

### (e) Foco — parcial

Campo 3 do `evCraftingFocusUpdate` bate **exatamente** com o foco da UI (`28671` ↔ "0 / 28.671").
Campo 1 é um contador interno maior, de escala não determinada. Não bloqueia nada.

### Correções de documentação

O doc 01 §8 tinha **três** interpretações erradas (campos 3/4 como "matéria-prima usada" e
"quantidade produzida"; campos vazios como "fim de lote"; um evento por unidade). Todas corrigidas
lá, com ponteiro para o doc 03.
