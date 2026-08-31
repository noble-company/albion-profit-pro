# 16 — Dashboard Market Flip

## Objetivo
Fazer do Market Flip a tela inicial e o caminho mais rápido para encontrar lucro entre cidades.

## O que implementar
- Shell visual dark premium com sidebar e navegação para Market Flip, Refino e Craft.
- KPIs de lucro disponível, quantidade de ofertas, dados públicos/privados e última atualização.
- Filtros compactos: item, cidades, tier, encantamento, qualidade, estratégia, frescor, lucro e ROI.
- Tabela ranqueada com item, compra, venda, fee, quantidade, lucro e ROI.
- Ordenação, paginação, atualização automática e estados de cobertura.
- Clique abre drawer/página de análise usando a calculadora detalhada da Task 14.
- Não transformar ausência de dados em lucro zero.

## Depende de
Task 15.

## Testes automatizados
Filtros, ordenação, ranking, servidor obrigatório, URL compartilhável, loading/empty/error e
acessibilidade da tabela.

## Implementação atual (2026-08-23)
- A home autenticada agora é o dashboard Market Flip, com navegação para Market Flip, Refino e
  Craft.
- Filtros ficam na URL e incluem item, cidades, tier, encantamento, qualidade, frescor, lucro,
  ROI e cobertura completa.
- A tabela exibe compra, venda, taxas, quantidade, lucro, ROI e cidade de cada lado, com paginação
  e estados explícitos de carregamento, erro, vazio e ausência de realm.
- O backend ganhou o filtro `item_id` em `/opportunities/flips`, e o OpenAPI/cliente TypeScript
  foi regenerado.
- Refino e Craft aparecem na navegação como páginas reservadas para a Task 17; o clique no item da
  oportunidade abre a calculadora detalhada já preenchida com o item selecionado.
- A busca por item agora é explícita: o texto só consulta ao clicar em **Pesquisar** ou pressionar
  Enter. O dashboard também oferece **Exibir apenas lucro** e seletor de ordenação, mantendo lucro
  maior → menor como padrão; os controles permanecem compartilháveis pela URL.
- As taxas do flip são configuráveis por oportunidade: **VIP?** alterna imposto de venda entre 4%
  e 8%, enquanto **Pedido de compra?** e **Pedido de venda?** adicionam 2,5% cada. O backend
  calcula e arredonda cada cobrança em separado, e inclui essas opções na chave de cache.
- Cada oportunidade também retorna `quality_level` e a UI traduz os níveis do catálogo para os nomes
  do jogo: Normal, Bom, Excelente, Excepcional e Obra-prima.
- O filtro textual de item foi removido do Market Flip. A tela usa somente seletores hierárquicos
  alimentados pelo dump oficial (`Categoria → Subcategoria → Tipo`), com os níveis adicionais
  persistidos no catálogo e filtros enviados ao endpoint de oportunidades.
