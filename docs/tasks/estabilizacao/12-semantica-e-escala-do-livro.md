# 12 — Semântica e escala do livro de mercado

> Corrige `R12` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Fazer a API declarar honestamente o que foi observado, evitar totais enganosos de snapshots
parciais e manter consultas proporcionais aos dados do item, não a todas as localizações conhecidas.

## Por que

O backend acumula ordens por `source_id`, mas o client pode enxergar apenas uma página/recorte. Uma
ordem comprada/cancelada não gera evento de remoção e permanece até frescor/poda. Somar essas linhas
como “profundidade atual” mistura observações de momentos diferentes. `get_item_prices` ainda monta
todas as localizações × 5 qualidades × 5 encantamentos antes de descobrir quais existem no item.

## O que implementar

1. Fazer uma captura controlada para determinar se cada resposta de offers/requests representa
   snapshot completo da combinação, página ou recorte. Registrar o resultado no doc 03.
2. Se houver snapshot completo identificável, incluir `scan_id`/lado/combinação e remover ou marcar
   ausentes **somente** dentro desse snapshot comprovadamente completo.
3. Se for parcial (hipótese conservadora), não inventar remoção. Renomear/documentar totais como
   `unidades_observadas`/`ordens_observadas`, incluir `observado_em`, `idade_segundos`, janela de
   frescor e indicador de cobertura parcial. Melhor preço também carrega idade.
4. Centralizar política de frescor/configuração e validar o default de 6h com produto/dado real.
5. Consultar combinações existentes para o item/realm diretamente no Postgres/cache. Não gerar
   produto cartesiano com toda `location` dinâmica. Paginar/filtrar por cidades quando a API puder
   devolver volume grande.
6. Revisar índices com `EXPLAIN (ANALYZE, BUFFERS)` em volume representativo, incluindo realm,
   encantamento, lado, expiração e frescor. Migration só adiciona índice justificado por plano.
7. Definir invalidação/cache de combinações que ficaram vazias; resposta antiga não pode sobreviver
   ao TTL como se fosse atual.
8. Atualizar schemas/endpoints antes do frontend para que ele não dependa do nome enganoso antigo.

## Depende de

Tasks 03 e 05.

## Testes automatizados

- Ordem expirada/fora do frescor não entra; metadado de idade/cobertura continua correto.
- Snapshot completo remove apenas seu próprio realm/lado/combinação, se esse modo for comprovado.
- Snapshot parcial nunca apaga ordem de outro recorte.
- Número de queries não cresce com quantidade global de localizações; resposta só inclui combinações
  existentes do item.
- Cache vazio/expirado não devolve payload antigo.

## Testes manuais

Comparar uma combinação com a tela do jogo em duas varreduras (incluindo ordem removida) e executar
`EXPLAIN ANALYZE` com dataset de escala documentada.

## Só o humano pode validar

Operação controlada no mercado e decisão de produto sobre janela de frescor/terminologia exibida.

