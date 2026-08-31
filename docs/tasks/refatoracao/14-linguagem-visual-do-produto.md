# 14 — Linguagem visual do produto

> Não corrige um achado isolado: é o que impede que `F01`, `F02` e `F05` voltem.

## Objetivo

Decidir, **antes** de reconstruir qualquer tela, como o produto se comunica visualmente — para
que as telas do bloco 4 sejam aplicações de uma regra, e não invenções independentes.

## Por que

As duas telas de oportunidade somam 1.561 linhas e foram escritas cada uma por conta própria:
espaçamentos diferentes, `Kpi` copiado, `p-4` em toda célula de tabela, `tracking-[0.28em]` num
lugar e `tracking-[0.18em]` em outro, três estilos de estado vazio. Isso não é falta de
capricho pontual — é ausência de uma decisão tomada uma vez e aplicada.

Sem esta task, as tasks 21-24 vão reconstruir as telas com componentes novos e reproduzir a
mesma incoerência, só que mais bonita.

## O que implementar

Esta task entrega **documentação e um protótipo navegável**, não features.

1. **Densidade e leitura de tabela.** O produto é um scanner: a tabela é a tela principal. Definir
   altura de linha, alinhamento (número à direita, sempre tabular-nums), largura mínima de
   coluna, comportamento de overflow, cabeçalho fixo e o que acontece no celular — hoje a tabela
   tem `min-w-[1120px]` e simplesmente rola.
2. **Hierarquia da informação.** O que o jogador precisa ver em meio segundo: lucro, ROI, item,
   rota. O que é secundário: taxas, quantidade, modo de aquisição. Isso define peso, tamanho e
   cor — não o contrário.
3. **Vocabulário de estado.** Um padrão só para carregando (skeleton com a forma do conteúdo, não
   o texto "Carregando…"), vazio, erro, dado velho e cobertura parcial. Hoje existem pelo menos
   três formatos diferentes de estado vazio.
4. **Sinalização de confiança.** O produto tem uma taxonomia honesta de avisos (`dado_velho`,
   `sem_cobertura`, `profundidade_insuficiente`, `ordem_nao_garantida`) que hoje aparece como
   badge cinza indistinta. Definir como cada nível de confiança se comunica visualmente — é
   diferencial do produto, não detalhe.
5. **Iconografia e microcópia.** Conjunto fechado de ícones lucide por conceito e regra de tom
   para os textos (as mensagens atuais são boas: "A ausência de dados não representa lucro
   zero" — isso precisa ser padrão, não exceção).
6. **Layout do shell.** Hoje a navegação é uma linha de links com dois `<select>` no meio, e vira
   um bloco solto no mobile. Definir a estrutura definitiva.
7. Publicar o resultado em `docs/13-linguagem-visual.md` e como página de referência viva no
   próprio app (rota de desenvolvimento).

## Depende de

Tasks 11, 12 e 13.

## Testes automatizados

- A página de referência renderiza todos os padrões sem erro, nos dois temas.
- Teste de acessibilidade automatizado (axe) sem violação séria na página de referência.

## Testes manuais

Revisão visual com o responsável do produto **antes** de iniciar a task 20. Esta é a task cujo
critério de pronto é a aprovação humana — as telas do bloco 4 dependem dela estar acordada.
