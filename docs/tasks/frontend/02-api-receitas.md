# 02 — API de receitas

## Objetivo
Expor a receita importada de um `unique_name` exato, com ingredientes estáveis e variantes.

## Por que
`src/recipes/` só possui modelos. Além disso, `RecipeIngredient` não guarda posição; prometer ordem
na resposta sem corrigir o modelo produziria resultado não determinístico.

## O que implementar
- Migration adicionando `recipe_ingredient.position` não nulo por receita; atualizar modelo e
  `scripts/import_recipes.py` para persistir a ordem do dump.
- Criar `src/recipes/{schemas,service,router}.py`.
- `GET /items/{unique_name}/recipe`: o path recebe a chave canônica (`T4_CLOTH` ou
  `T4_CLOTH@1`), sem query duplicada de encantamento.
- Responder output, valores da receita, ingredientes ordenados com nome e `tem_receita_propria`,
  recurso de upgrade e `variantes_encantadas` como unique names existentes.
- Item inexistente: 404 `item_nao_encontrado`. Item existente sem linha de receita: 404
  `receita_indisponivel`. Códigos fazem parte do contrato.
- Registrar antes de qualquer rota genérica conflitante e documentar as receitas alternativas que
  o schema atual não representa.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Task 01.

## Testes manuais
Consultar `T2_CLOTH`, uma variante `@1` real e um item sem receita; comparar ingredientes com o
dump.

## Testes automatizados
Ordem persistida, chave encantada exata, upgrade nulo/base e preenchido/encantado, variantes
existentes, dois 404 semânticos e autenticação.
