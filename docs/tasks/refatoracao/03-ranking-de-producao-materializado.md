# 03 — Ranking de produção materializado

> Corrige `B02`. Habilita a task 23 (camada "e se" no cliente).

## Objetivo

Fazer o ranking de refino e craft cobrir **todas** as receitas e responder por leitura indexada,
em vez de simular milhares de cenários dentro do request.

## Por que

`recipe_opportunities` seleciona candidatos com `.limit(200)` ordenado por
`Recipe.output_item_unique_name` — **ordem alfabética** — sobre 5.633 receitas semeadas. O que a
tela chama de "o que vale a pena refinar" é, na verdade, *o melhor entre as 200 primeiras
receitas do alfabeto*. Nada avisa o usuário. Para um produto cuja proposta é achar a melhor
oportunidade, isso é falha de correção, não de performance.

Somado a isso, o laço é `candidatos × cidades × qualidades` chamando `simulate_craft` de forma
sequencial, cada chamada com suas próprias queries: até 200 × 8 × 5 = 8.000 simulações por
request. O cache Redis de 30 s não salva, porque a chave inclui todos os filtros (taxa de
retorno, custo de estação, foco), então a taxa de acerto real é baixíssima.

## O que implementar

1. Criar tabela materializada de ranking — uma linha por (realm, receita, cidade, qualidade),
   guardando os **componentes** do resultado, não só o número final:
   custo de ingrediente por modo de aquisição, preço de saída por modo de venda, custo de prata
   da receita, foco por execução, quantidades produzidas e o `oldest_observed_at` de cada lado.
2. Calcular em **parâmetros neutros** (`return_rate=0`, `station_cost=0`, sem imposto aplicado),
   de modo que premium, retorno, estação e taxas possam ser aplicados depois — no cliente
   (task 23) ou numa projeção barata no servidor.
3. Job Celery na fila `maintenance` que recalcula o ranking; disparo por agenda e/ou por
   invalidação após ingest. Definir e documentar a janela de atualização aceitável.
4. Remover o `.limit(200)`. A cobertura passa a ser total e verificável.
5. Trocar a leitura de `/opportunities/refining` e `/crafting` por `SELECT ... WHERE ...
   ORDER BY ... LIMIT/OFFSET` sobre a tabela, com índices para os filtros usados na UI (realm,
   tier, encantamento, qualidade, cidade, lucro, ROI, frescor).
6. Manter `POST /craft/simulate` como está para o detalhe de um item: continua sendo a
   simulação exata com profundidade de livro, sob demanda.
7. Expor no payload a **cobertura do ranking** (quantas receitas foram avaliadas, quando o
   ranking foi calculado) para que a UI nunca mais esconda truncamento.

## Depende de

Tasks 01 e 05. Deve ficar pronta antes das tasks 17, 22 e 23.

## Testes automatizados

- O ranking contém receitas fora das 200 primeiras em ordem alfabética (teste que falharia hoje).
- Contagem de receitas avaliadas é igual ao total de receitas elegíveis do realm.
- O número de queries de `/opportunities/refining` é **constante** e não cresce com o dataset.
- Resultado do ranking materializado bate com `simulate_craft` para uma amostra de linhas, nos
  mesmos parâmetros neutros.
- Reexecução do job é idempotente: rodar duas vezes não muda o conteúdo.
- Ranking desatualizado é sinalizado no payload, não silenciosamente servido como atual.

## Testes manuais

Rodar o job num dump real e conferir que um refino conhecidamente lucrativo com nome no fim do
alfabeto (que hoje nunca aparece) passa a figurar no ranking.
