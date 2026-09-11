# 27 — Itens com mais de uma receita

## Objetivo

Trazer para o catálogo os itens que o importador descarta por terem **mais de uma forma de
craftar** — principalmente as armas e armaduras de artefato de facção.

## Por que

Achado durante a análise da task 26 (2026-09-10). `build_recipe` (`scripts/import_recipes.py:138-146`)
devolve `None` quando `craftingrequirements` é uma lista e o item não é recurso refinado; a
semeadura conta isso como `skipped_multiple_recipes`. No dump atual:

- **727 itens base** e **2.420 níveis encantados** ficam fora do catálogo.
- O Arco do Guardião T6 (`T6_2H_BOW_KEEPER`) não existe em `/craft`.

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

`/craft` › Armas › Arcos: o Arco do Guardião aparece, com o artefato na lista de compras e na
mesma quantidade do Rendimento.

## Estado da implementação

_Não iniciada._
