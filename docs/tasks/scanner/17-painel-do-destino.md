# 17 — Painel do Destino: o custo de foco que o jogador realmente paga

## Objetivo

Que a coluna `Lucro/foco` diga a verdade. Hoje ela usa o custo de foco **sem especialização
nenhuma** — o número do dump — e erra por até 16× para quem tem o painel evoluído.

## Por que

> "cada nível de especialização faz o player gastar menos foco ao refinar. Não aumenta a taxa de
> retorno, mas faz gastar muito menos"
>
> "se o player é nível 100 no refino de fibra T4, isso vai afetar um pouco o refino de outras
> fibras, mas vai afetar muito o refino da fibra T4 — e isso é pra tudo"
>
> "queria saber se é possível simular esse painel numa aba separada, pro player fazer o
> mapeamento do nível de habilidade dele"

`crafting_focus` vem do `ITEM DUMP.json` e é o custo base. Com o painel maxado o jogo cobra
**6,25%** disso. Um `T8_CLOTH` sai de 503 para 31 de foco.

Foco é o recurso escasso de quem refina — é a métrica que decide o que fazer no dia. Errar por
16× não é imprecisão: é ranquear errado.

## O modelo

```
custo de foco = base × 0,5 ^ (FCE / 10000)
```

Cada **10.000 pontos de eficiência (FCE) divide o custo pela metade**. O FCE é a soma dos nós do
painel, e cada nó dá dois tipos de ponto por nível:

- **amplo** — vale para tudo o que aquele ramo cobre;
- **específico** — vale só para o item daquele nó, e é sempre muito maior.

É essa forma que produz o "um pouco nos outros, muito no específico" que o jogador descreve.

### Confirmação no jogo

`Tecelão de Fibras Adepto` no nível 100 mostra no próprio Sumário de Recompensas:
`+3.000 ao refinar fibras` (100 × 30) e `+25.000 ao refinar Cânhamo` (100 × 250).

### Coeficientes por nível

| Categoria | Nó base (amplo) | Base (específico) | Spec (amplo) | Spec (específico) |
|---|---|---|---|---|
| **Refino** (fiber, hide, ore, wood, rock) | 30 (todos os tiers) | 250 (o próprio tier) | — | — |
| Kit de rastreamento | 30 | — | 30 | 340 |
| Equipamento de coleta | 60 | 250 (a "arma" de coleta) | 30 | 250 |
| Capas | 30 | — | — | 370 |
| Bolsas — bolsa | 30 | — | — | 340 |
| Bolsas — sacola da visão | 30 | — | 30 | 310 |
| Cerco (martelo, estandarte) | 30 | — | 30 | 310 |
| Armas — sem artefato | 30 | — | 30 | 250 |
| Armas — artefato | 30 | — | 15 | 250 |
| Armas — cristal | 30 | — | 2,15 | 250 |
| Armaduras — sem artefato | 30 | — | 30 | 250 |
| Armaduras — artefato | 30 | — | 15 | 250 |
| Mão secundária — principal | 30 | — | 90 | 250 |
| Mão secundária — artefato | 30 | — | 15 | 250 |
| Mão secundária — cristal | 30 | — | 2,15 | 250 |
| Culinária e alquimia | 30 | — | 30 | 250 |

Não existe armadura de cristal.

### Duas formas de árvore, não uma

| | Nó | Tiers |
|---|---|---|
| **Refino** | um por **tier** (`Tecelão de Fibras Adepto` = T4) | cada tier é um nó |
| **Craft** | um por **linha de item** (`Fabricante de Cajados Amaldiçoados`) | desbloqueiam por nível dentro do mesmo nó |

É a diferença que decide a chave do dado. Descoberta lendo as capturas do painel, não suposta.

### O escopo do "amplo" nem sempre é a linha

Os nós de **cristal** dizem `ao fabricar todas as Armas de Mago e Mãos Secundárias` — categoria
inteira, atravessando linhas. O resto que aparece nas capturas é escopo de linha. O modelo
precisa carregar o escopo por tipo de nó, em vez de assumir "linha" para todos.

## Os nós saem do dado, não da digitação

| O que | De onde |
|---|---|
| Linha (nó base) | `@craftingcategory` do dump — **44 valores**: `fiber` `hide` `ore` `wood` `rock` `cursestaff` `sword` `cloth_armor` … |
| Nó de especialização | `unique_name` sem tier e sem encantamento: `T6_MAIN_CURSEDSTAFF@2` → `MAIN_CURSEDSTAFF` |
| Normal / artefato / cristal | a receita consome `%ARTEFACT%`? Se sim e o nome termina em `_CRYSTAL` → cristal; se sim → artefato; se não → normal |

Validado na linha do cajado amaldiçoado: `T5_MAIN_CURSEDSTAFF_CRYSTAL` ("Cajado Pútrido") cai em
cristal e `T5_MAIN_CURSEDSTAFF` em normal — exatamente o que o painel do jogador mostra (+2,15 e
+30). São 720 receitas com artefato no catálogo, e a regra precisa de uma passada de validação
sobre **todas** elas na implementação, não só sobre a amostra.

## O que implementar

### Backend

1. **Importar `@craftingcategory`** para `item` (migração + `scripts/import_items.py`). Já está
   no dump; não é coletado hoje.
2. **`user_destiny_node`** — `(user_id, node_key, level)`, nível de 0 a 100. `node_key` é opaco
   para o banco: `refine:fiber:4`, `base:cursestaff`, `spec:MAIN_CURSEDSTAFF`.
3. **`GET` / `PUT /me/destiny-board`** — o painel inteiro do usuário numa resposta.

No servidor, e não em `localStorage`: o painel é do jogador, não do navegador.

### Frontend

4. **Aba "Painel do Destino"** — uma grade por ramo, **não** uma réplica visual da árvore do
   jogo. A grade captura 100% do que a conta precisa por uma fração do custo; o desenho bonito
   não paga.
   - começa zerada e o jogador preenche só o ramo que usa (quem refina tecido mexe em 5 números);
   - ramos ordenados por relevância — primeiro os que aparecem nas receitas da tela dele.
5. **`focusEfficiency(item, painel)`** no engine, multiplicando `crafting_focus` antes de
   `calculateFocusConsumed`.

## Riscos e decisões registradas

- **A constante `10000` não foi verificada contra o personagem do usuário.** Pedi o cruzamento
  (níveis dos cinco nós de fibra × custo de foco que o jogo mostra) e ele respondeu que a fórmula
  está certa e para seguir. Fica como **premissa declarada**: se algum dia o número da tela não
  bater com o do jogo, é o primeiro lugar a olhar.
- **`POST /craft/simulate` não conhece FCE.** Se o scanner aplicar e ele não, o painel de detalhe
  mostra dois consumos de foco diferentes para a mesma linha. Decidir **antes de codar**: ou o
  cliente manda o foco já ajustado, ou o endpoint ganha o campo.
- **O painel é por personagem, não por conta.** Guardar um por usuário serve para quem tem um
  main; quem alterna personagem veria o número do outro. Dizer isso na tela.

## Escopo faseado

**Primeira entrega: só refino** — 5 ramos × 5 tiers = 25 campos, na tela que já existe e onde a
métrica já está errada. O modelo de dados nasce geral, então craft, comida e poção entram depois
**sem migração nova**.

## Depende de

Task **11**. Independe da 12 (tela de Craft) — o refino já se beneficia sozinho.

## Testes automatizados

- `0,5^(FCE/10000)` com o caso real do painel: `Tecelão de Fibras Adepto` em 100 dá 28.000 de FCE
  ao refinar Cânhamo, e o custo cai para ~14% do base.
- Nó em zero não muda nada — quem não preencheu o painel vê o custo base.
- A classificação normal/artefato/cristal derivada da receita bate com a amostra do painel.
- O escopo do amplo é respeitado: subir um nó de cristal muda o custo de outra arma de mago;
  subir uma linha normal não muda o de outra linha.

## Testes manuais

Comparar o consumo de foco da tela com o que a estação do jogo cobra, em duas receitas de tiers
diferentes.
