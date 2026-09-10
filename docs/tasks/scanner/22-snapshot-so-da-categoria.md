# 22 — Snapshot só da categoria na tela (opcional)

## Objetivo

O polling de 30 s do snapshot de preço traz **só os itens da categoria selecionada**, em vez do
realm inteiro.

## Por que

Com a task 21, a tela passa a olhar uma categoria por vez, mas o snapshot continua trazendo tudo:
~333 KB a cada 30 s com as 8 cidades (medido na task 03). É a alavanca de servidor que faz
sentido nesta arquitetura — no lugar da paginação descartada na 21.

**Opcional.** Só vale a pena se a medida mostrar ganho relevante. O cache HTTP e o `gzip` já
existem; o polling já pausa com a aba oculta.

## O que implementar

1. `GET /prices/snapshot` aceita a categoria (`kind` + `category`/`subcategory`), e o servidor
   resolve a lista de itens — saídas e ingredientes das receitas dela.
   **Não** por lista de itens na URL: uma categoria de ~100 receitas com ingredientes passa dos
   4.096 caracteres.
2. O `queryKey` do snapshot inclui a categoria. Aqui a mudança de chave é aceitável: trocar de
   categoria é uma ação explícita, não uma tecla.
3. Top 15 continua pedindo o realm inteiro.

## Depende de

Task **21**.

## Testes automatizados

- O snapshot filtrado traz exatamente os itens das receitas da categoria (saídas e ingredientes).
- Sem categoria, o comportamento é o de hoje.
- Medir e registrar o payload antes e depois.

## Testes manuais

Na aba de rede, conferir o tamanho da resposta do snapshot com uma categoria selecionada.

## Estado da implementação

_Não iniciada._
