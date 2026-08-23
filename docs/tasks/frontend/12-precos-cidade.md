# 12 — Preços por cidade

## Objetivo
Exibir os dois lados do livro sem esconder idade, cobertura ou dimensões.

## Por que
Misturar offer/request recria o achado C3. A API não devolve o produto cartesiano completo: omite
combinações nunca vistas, que não podem parecer zeros.

## O que implementar
- Página de item e tabela sobre `GET /items/{unique_name}/prices?scope=all|mine`.
- Filtros de cidade, qualidade e encantamento; venda (menor ask) e compra (maior bid) em colunas
  distintas, com unidades, ordens, volume 24 h e `varredura_em`.
- `scope=mine` representa cobertura do usuário sobre acervo global; texto deve explicar essa
  semântica. Resposta vazia é “sem cobertura/dado”, nunca preço zero.
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
C3 visual, dimensão/filtros, combinação ausente, dado velho/nulo, toggle mine, fallback de local e
polling suspenso em aba oculta.
