# 12 — Preços por cidade

## Objetivo
Exibir os dois lados do livro sem esconder idade, cobertura ou dimensões.

## Por que
Misturar offer/request recria o achado C3. A API não devolve o produto cartesiano completo: omite
combinações nunca vistas, que não podem parecer zeros.

## O que implementar
- Página de item e tabela sobre `GET /items/{unique_name}/prices?server=&scope=all|mine`. `server`
  vem do estado global da task 09, nunca redigitado nesta tela.
- Filtros de cidade, qualidade e encantamento; consumir `location_id` repetível e paginação
  `limit`/`offset` (`total` vem na resposta).
- Venda (menor ask) e compra (maior bid) em colunas distintas. Cada lado usa `melhor_preco`,
  `unidades_observadas`, `ordens_observadas`, `observado_em` e `idade_segundos`; a combinação
  também mostra `cobertura` e `janela_frescor_segundos`, além do volume de 24 h.
- `scope=mine` representa cobertura do usuário sobre acervo global; texto deve explicar essa
  semântica. Resposta vazia é “sem cobertura/dado”, nunca preço zero. **Livro e histórico têm
  cobertura independente dentro da mesma combinação** (estabilização task 05): renderizar
  `venda`/`compra` e `vendido_24h` cada um com seu próprio estado vazio, nunca tratar a ausência de
  um como ausência do outro.
- Polling apenas enquanto aba visível, com intervalo configurado e cancelamento. Preservar seleção
  na URL para compartilhar/voltar.
- Mostrar metadado de cidade via `/locations`, com fallback de ID.

## Bibliotecas/dependências
TanStack Query e tabela shadcn.

## Depende de
Tasks 09 e 11.

## Testes manuais
Comparar offer/request e timestamp com mercado aberto.

## Testes automatizados
C3 visual, dimensão/filtros, combinação ausente, dado velho/nulo, toggle mine, fallback de local,
polling suspenso em aba oculta, `server` sempre presente na query e livro/histórico renderizados com
estados vazios independentes.
