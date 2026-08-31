# 17 — Ordenação e paginação no servidor

> Corrige `F08`.

## Objetivo

Fazer o ranking exibido ser realmente o ranking pedido, e os contadores de paginação dizerem a
verdade.

## Por que

O servidor pagina (`limit=25`) e ordena por lucro. O cliente então **re-ordena as 25 linhas que
recebeu**, em `opportunities/pages.tsx` e `production-pages.tsx`:

```ts
sorted.sort((a, b) => { const difference = value(a) - value(b); ... })
```

Escolher "ROI (maior → menor)" ordena o ROI **dentro da página 1 do ranking de lucro**. Não é o
ranking de ROI — é uma reordenação de uma amostra enviesada. O mesmo vale para "Atualização". O
usuário acredita estar vendo as melhores oportunidades por ROI e está vendo outra coisa.

O mesmo defeito, em outra forma, está em `prices/pages.tsx`: os filtros de Qualidade e
Encantamento são aplicados com `.filter()` **depois** da paginação. O contador "1–20 de 137"
conta o total sem filtro, e a página pode aparecer vazia mesmo havendo resultados adiante.

Há ainda o detalhe de precisão: `value()` usa `Number(row.roi)` — aritmética monetária no
cliente, o que a task 18 elimina.

## O que implementar

1. Enviar o critério de ordenação ao servidor (`sort` = `profit`/`roi`/`freshness`, `direction`)
   e aplicá-lo no SQL, sobre o conjunto completo.
2. Enviar os filtros de qualidade e encantamento da tela de preços ao servidor; `total` passa a
   refletir o conjunto filtrado.
3. Remover toda reordenação e filtragem pós-paginação do cliente.
4. Corrigir os contadores para descreverem o conjunto real ("1–20 de N filtrados").
5. Validar `sort` contra uma lista fechada no backend, sem interpolação de string em SQL.
6. Definir desempate estável (por exemplo lucro, depois `item`, depois `location`) para que a
   paginação não repita nem pule linha entre páginas.

**Nota de escopo:** o "e se" do cliente (task 23) reordena localmente **por desenho**, quando os
parâmetros mudam sem novo fetch. A diferença é que ali o conjunto em memória é o universo
relevante e isso é explícito; aqui é uma amostra paginada tratada como se fosse o todo.

## Depende de

Tasks 02, 03 e 15.

## Testes automatizados

- Ordenar por ROI e paginar produz sequência globalmente decrescente entre páginas — teste que
  hoje falharia.
- Filtrar qualidade na tela de preços muda o `total`.
- `sort` inválido é rejeitado com 422 e não chega ao SQL.
- Percorrer todas as páginas não repete nem omite linha (desempate estável).
- Nenhum `.sort()` ou `.filter()` sobre resultado paginado permanece nos componentes.

## Testes manuais

Ordenar por ROI, anotar as 25 primeiras linhas e conferir na página 2 que os valores continuam
descendo, sem repetição.
