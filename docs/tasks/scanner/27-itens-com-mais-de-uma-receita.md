# 27 — Itens com mais de uma receita

## Objetivo

Trazer para o catálogo os itens que o importador descarta por terem **mais de uma forma de
craftar** — principalmente as armas e armaduras de artefato de facção.

## Por que

Achado durante a análise da task 26 (2026-09-10). `build_recipe` (`scripts/import_recipes.py:138-146`)
devolve `None` quando `craftingrequirements` é uma lista e o item não é recurso refinado; a
semeadura conta isso como `skipped_multiple_recipes`. No dump atual:

- **727 itens base** e **2.420 níveis encantados** ficam fora do catálogo.
- O Arco Badônico do Mestre (`T6_2H_BOW_KEEPER`, T6) não existe em `/craft`.

| Itens base | Onde | O que diferencia as rotas |
|---|---|---|
| 320 | Armas | artefato × token de favor (`T4_ARTEFACT_TOKEN_FAVOR_N`) |
| 60 cada | Mão secundária, Cabeça, Armadura, Calçados | artefato × token de favor |
| 80 | Fabricação | outras (ex.: `T1_FISHCHOPS`, `T5_WOOD_LEVEL1`) |
| 15 cada | Cabeça, Armadura, Calçados Royal | outras (ex.: `T4_HEAD_CLOTH_ROYAL`) |
| 24 | Artefatos | runa, alma ou relíquia × outra |
| 17 | Cosméticos, facção, consumível, mobília | outras |

4 itens têm rotas idênticas (mesmos ingredientes e quantidades).

## Pontos a decidir antes de implementar

- **Qual rota vira a receita.** `recipe` tem índice único por saída
  (`ix_recipe_output_item_unique_name`). Duas saídas:
  - (a) **uma rota padrão por item** — a do artefato, para equipamento de facção. É o que o refino
    já faz com a rota de token de facção (`select_standard_refining_requirements`).
  - (b) **modelar variantes** — índice por saída + rota; contrato, engine e tela passam a mostrar
    a mesma saída mais de uma vez.
- **Os outros padrões** (Royal, peixe picado, madeira encantada, runas): conferir um por um o que
  cada rota é no jogo antes de escolher.
- **O token de favor** como rota alternativa: se vale mostrar depois, e como.

## O que implementar (com a opção a)

1. Seletor de rota padrão no importador para equipamento de artefato, nos níveis 0 a 4; os outros
   padrões conforme a decisão acima.
2. `STATIC_TRANSFORM_REVISION`, manifesto e `expected` (contagem de receitas e de puladas) — a
   semeadura pula quando o sha do manifesto não muda.
3. Nada muda no contrato: o catálogo e a tela passam a ter os itens.

## Depende de

Task **26**. Importar mais 2.900 receitas de artefato com o retorno aplicado ao artefato só
aumentaria o erro que a 26 corrige.

## Testes automatizados

- Arma de artefato com duas rotas é importada pela rota do artefato, nos níveis 0 a 4.
- O ingrediente artefato chega com `return_eligible = false` (task 26).
- `skipped_multiple_recipes` cai para os padrões ainda não decididos.
- O import continua idempotente.

## Testes manuais

`/craft` › Armas › Arcos: o Arco Badônico aparece, com o artefato na lista de compras e na
mesma quantidade do Rendimento.

## Estado da implementação

**Concluída.** Backend `pytest tests` **430 passaram**, 1 falha que já existia
(`test_compare_query_count_does_not_grow_with_city_count`, fora desta task) · `ruff` limpo. O
frontend não mudou: os itens aparecem nas categorias pelo catálogo.

Guards vermelhos primeiro: as duas do artefato (base e encantado) falharam; "peça Royal continua
fora" passou contra o código antigo — é a trava de que a mudança não pegou o que não devia.

### A decisão (usuário, 2026-09-10)

**Opção (a): a receita do artefato.** `select_artifact_route` só age quando alguma receita da lista
usa `_ARTEFACT_TOKEN_FAVOR_`, e escolhe a única receita sem o token que tem um `_ARTEFACT_`. Contado
com as funções do próprio importador: **2.800 saídas** (560 base + 2.240 encantadas) — armas 1.600,
e 300 cada em mão secundária, cabeça, armadura e calçados —, **todas com exatamente uma receita de
artefato**. Nenhuma ambígua.

Os outros casos ficaram fora, por decisão junto com o usuário:

| Caso | As receitas | Por que fora |
|---|---|---|
| Peças Royal (225) | Trocar SET1, SET2 ou SET3 + selos Royal | O custo depende de qual peça o jogador tem |
| Peixe picado | 38 receitas, uma por peixe, cada uma rende diferente | Uma receita por item não representa |
| Recurso bruto encantado | Subir o encantamento do nível anterior ou do base, pagando prata | Transmutação, não craft |
| Almas e relíquias | Runa → alma, ou token de GvG | Conversão |
| Tokens de facção, blocos de pedra | Troca de token; 5 receitas de bloco | Os blocos já estavam fora |

### Medido

- Import: **8.433 receitas** (antes 5.633), **339 puladas** (antes 3.139), 39 sem `item_id` (igual).
  3.520 receitas com artefato marcado como não retornável (task 26).
- `T6_2H_BOW_KEEPER@3`: tábuas encantadas ×32 retornam, `T6_ARTEFACT_2H_BOW_KEEPER` ×1 não.
- **Catálogo de craft: 8.323 receitas, 197,3 KB com gzip** (5.692 KB cru), leitura em 886 ms. O teto
  da task 02 era 200 KB — cabe, mas sem folga. Refino: 110 receitas, 5,2 KB.
- **Semeadura de verdade no banco local** (`seed_static_data --dataset-dir`), com os dumps da raiz e
  o `world.json` do manifesto que sobrou da task 01 em `%TEMP%` — sem baixar nada, e com o SHA-256
  de cada arquivo conferido. Versão `2026-09-10-5cf2e8e9-artifact-route-v1` aplicada.

### O que só apareceu implementando

- **Reimportar pelo script não bastaria para a tela.** Na task 26 o catálogo mudou de formato, e o
  `ETag` muda com o formato. Aqui só o conteúdo muda, e a versão do catálogo vem do dataset ativo —
  que só a semeadura troca. Com `scripts.import_recipes` sozinho o servidor responderia `304` e o
  navegador ficaria com as 5.523 receitas antigas. Com a semeadura, o `ETag` do craft passou de
  `b6e558d1…` para `1b228698…`.
- **"Todas" e o Top 15 do craft ficam mais pesados**: 8.323 receitas contra 5.523. Os 2,7 s medidos
  na task 12 devem ir para perto de 4 s — estimativa proporcional, não medida. Escolher uma categoria
  continua rápido (task 21).

### Pendente pra você testar

1. Dar F5 em `/craft` e escolher **Armas → Arcos**: o Arco Badônico aparece, do T4 ao T8, com os
   encantamentos.
2. Abrir a linha do Arco Badônico do Mestre (T6) com 10 receitas e retorno 15,2%: Rendimento 11, e na coluna
   Compra o artefato ×11 e as tábuas ×320.
3. Clicar em **Top 15** no craft e conferir que o "Calculando…" termina em poucos segundos.
