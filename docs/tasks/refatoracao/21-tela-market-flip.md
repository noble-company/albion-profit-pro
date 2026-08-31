# 21 — Tela Market Flip

## Objetivo

Reconstruir a tela principal do produto sobre a fundação das tasks 11-20, entregando a promessa
"compre barato numa cidade, venda caro em outra" de forma legível em segundos.

## Por que

A tela atual funciona, mas foi escrita antes de existir design system e antes de os motores
serem corrigidos. Ela carrega: componentes duplicados (`F05`), ordenação que mente (`F08`),
aritmética em `number` (`F09`), três estilos de estado vazio, filtros num painel de 200 linhas
com três `fieldset` e nenhum ícone.

Com as tasks 02, 04, 17 e 18 concluídas, boa parte da complexidade dela deixa de existir: a
coluna "Taxas" vem pronta da API, a ordenação é do servidor, e o cálculo sai do componente.

## O que implementar

1. Reconstruir `MarketFlipPage` usando exclusivamente os componentes da task 20 e a linguagem
   visual da task 14.
2. Aplicar a hierarquia definida: lucro e ROI dominantes, rota (cidade de compra → cidade de
   venda) imediatamente legível, custos e taxas como informação secundária.
3. Consumir os campos novos do contrato (task 04): `gross_revenue`, `sales_tax`, `setup_fee`,
   `net_revenue` — sem nenhuma conta no componente.
4. Comunicar confiança de forma explícita: `dado_velho`, cobertura parcial e quantidade
   executável precisam ficar visíveis, não escondidos num badge cinza. Este é o diferencial
   honesto do produto e hoje está subcomunicado.
5. Manter as mensagens de estado vazio que já estão certas ("A ausência de dados não representa
   lucro zero") e padronizá-las conforme a task 14.
6. Preservar a sincronia de filtros com a URL, para que uma oportunidade possa ser compartilhada
   por link.
7. Indicador de atualização honesto: o selo "Atualização automática · 30s" só pode aparecer se o
   polling estiver de fato ativo (aba visível, conforme task 15).

## Depende de

Tasks 02, 04, 17, 18, 19 e 20.

## Testes automatizados

- Render com dados devolvidos por MSW no formato do contrato novo.
- Filtro alterado mantém a tabela anterior visível (sem piscar) e atualiza a URL.
- Estados de carregando, vazio e erro renderizam o padrão da task 14.
- Nenhuma operação aritmética sobre campo monetário no componente (verificado por lint).
- Avisos de confiança aparecem quando o payload os traz.

## Testes manuais

Com backend real e dados coletados em jogo, confirmar que a primeira tela responde "o que eu
faço agora para lucrar" em menos de cinco segundos de leitura. Testar em 1366×768 e no celular.
