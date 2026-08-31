# 11 — Busca de itens

## Objetivo
Criar autocomplete acessível com filtros e navegação ao item.

## Por que
O catálogo é grande e contém itens sem receita; isso precisa ser descoberto antes de abrir a
calculadora.

## O que implementar
- `BuscaItem` e `useBuscaItens` sobre `/items/search`, debounce de 300 ms e cancelamento da request
  anterior.
- Não consultar query vazia; definir tamanho mínimo e mensagem coerentes com a API.
- Busca PT/EN/unique name, filtros de tier/categoria/craftável e resultado com encantamento e selo
  `sem receita`.
- Combobox WAI-ARIA, teclado, foco e estados loading/vazio/erro. Seleção navega usando
  `encodeURIComponent(unique_name)`.

## Bibliotecas/dependências
Componente Command/Popover shadcn, sem implementar combobox do zero se a composição escolhida não
cumprir acessibilidade.

## Depende de
Tasks 01 e 09.

## Testes manuais
Buscar algodão/cotton/T4_CLOTH, operar só com teclado e testar mobile.

## Testes automatizados
Debounce/cancelamento, filtros, zero resultado, selo, teclado e URL de item encantado.

## Implementação concluída (2026-08-23)

- `BuscaItem`, `useBuscaItens` e service conectados a `/items/search`.
- Debounce de 300 ms, cancelamento via `AbortController` e nenhuma consulta com menos de dois
  caracteres.
- Filtros de tier, encantamento, categoria e somente craftáveis, com selo de item sem receita.
- Combobox com roles WAI-ARIA, teclado, foco, estados loading/vazio/erro e navegação codificada
  para `unique_name`.
- Teste automatizado cobre filtros e identificador encantado.
