# 02 — API de receitas

## Objetivo
Expor a receita importada de um `unique_name` exato, com ingredientes estáveis e variantes.

## Por que
`src/recipes/` só possui modelos. Além disso, `RecipeIngredient` não guarda posição; prometer ordem
na resposta sem corrigir o modelo produziria resultado não determinístico.

## O que implementar
- Migration segura sobre as 5.553 receitas existentes: adicionar `recipe_ingredient.position`
  temporariamente nullable (ou com default transitório), fazer backfill determinístico por receita,
  validar todas as linhas e só então aplicar `NOT NULL` e remover o default transitório. Atualizar
  modelo e `scripts/import_recipes.py` para persistir a ordem real do dump; não depender de UUID ou
  da ordem física do PostgreSQL.
- A mudança do transformador de receitas deve revisar a identidade do seed estático. Um ambiente
  com dataset anterior ativo precisa reaplicar as receitas e recuperar a ordem do dump; uma segunda
  execução da mesma revisão permanece `unchanged`.
- Criar `src/recipes/{schemas,service,router}.py`.
- `GET /items/{unique_name}/recipe`: o path recebe a chave canônica (`T2_CLOTH` ou
  `T4_OFF_SHIELD@1`), sem query duplicada de encantamento. Recursos com a segunda convenção do
  catálogo preservam a chave completa, por exemplo `T4_CLOTH_LEVEL4@4`.
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
Migration sobre banco populado, upgrade do seed anterior, idempotência, ordem persistida, chave
encantada exata, upgrade nulo/base e preenchido/encantado, variantes existentes, dois 404
semânticos e autenticação.

## Implementação concluída em 2026-08-23

- Migration `a2d7e8f9b0c1` adiciona `position` com backfill determinístico em banco populado,
  validação, `NOT NULL`, ausência de default residual e invariantes de posição não negativa/única
  por receita.
- O import preserva a ordem base zero do `craftresource`. A revisão global
  `item-search-v1-recipe-order-v1` força ambientes anteriormente semeados a reaplicar receitas e
  retorna `unchanged` nas execuções seguintes.
- `GET /items/{unique_name}/recipe` foi publicado com JWT, output e valores da receita,
  ingredientes enriquecidos e ordenados, `tem_receita_propria`, upgrade e variantes encantadas.
  Os erros contratuais são `item_nao_encontrado` e `receita_indisponivel`.
- Desvio corretivo descoberto no dump real: recursos encantados usam `_LEVELN` no XML e
  `_LEVELN@N` no catálogo/mercado. Outputs e ingredientes agora são convertidos apenas quando a
  chave candidata existe em `items.json`. Isso reduziu outputs sem correspondência de 78 para 39
  e deixou zero ingredientes/upgrades importados sem ID.
- O contrato aparece em `/openapi.json`. `frontend/src/api/schema.d.ts` não foi antecipado porque
  o gerador é deliberadamente entregue pela Task 07, após as APIs 01–05 estarem estáveis.
- Validações finais: 23 testes focados aprovados, Ruff global aprovado e suíte completa do backend
  com 260 testes aprovados.
