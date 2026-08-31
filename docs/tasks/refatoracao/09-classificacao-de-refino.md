# 09 — Classificação de refino sem heurística de substring

> Corrige `B11`.

## Objetivo

Separar refino de fabricação por um atributo confiável do catálogo, não por busca de texto na
categoria da loja.

## Por que

`_is_refining_item` decide se um item é de refino procurando as substrings `"resource"`,
`"refin"` e `"material"` em `shop_category`/`shop_subcategory`. O espelho SQL
(`_refining_item_filter`) faz seis `ilike '%...%'` combinados com `OR`.

Dois problemas: um item novo com categoria fora desse padrão cai na aba errada — e ninguém
percebe, porque a ausência na lista parece "sem oportunidade"; e `ilike '%...%'` não usa índice,
o que pesa exatamente na consulta que a task 03 quer tornar barata.

## O que implementar

1. Determinar a classificação a partir do dado estático já disponível (`ITEM DUMP.json` /
   `items.json`), no import — não em tempo de consulta. As receitas de refino têm forma
   distinguível na fonte; documentar qual sinal é usado, em
   [02-dados-de-receita.md](../../02-dados-de-receita.md).
2. Persistir a classificação como coluna do catálogo ou da receita (por exemplo
   `production_kind` com valores `refining`/`crafting`), com migration e índice.
3. Atualizar o seed estático e o versionamento do dataset (`StaticDatasetVersion`) para que a
   nova coluna derivada seja recalculada em instalações já semeadas — atenção ao achado `W2`
   da Fase 3, em que só o checksum do manifesto decidia `unchanged`.
4. Substituir `_is_refining_item` e `_refining_item_filter` por um filtro de igualdade.
5. Registrar quantos itens mudam de classificação em relação à heurística atual — é o número
   que prova que a heurística estava errando.

## Depende de

Tasks 01 e 03 (a tabela de ranking já deve existir para receber a coluna nova).

## Testes automatizados

- Um item cuja `shop_category` não contém nenhuma das três substrings, mas que é refino de
  fato, aparece na aba de refino.
- Um item de fabricação com a palavra "material" na subcategoria **não** vaza para o refino.
- Reexecutar o seed sobre uma base já semeada popula a coluna nova (teste de upgrade).
- A consulta de ranking usa índice — confirmado por `EXPLAIN`, sem varredura sequencial.

## Testes manuais

Comparar as duas listas (heurística antiga x classificação nova) e revisar as diferenças item a
item com o dump do jogo em mãos.
