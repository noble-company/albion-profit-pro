# A05 — Qualidade no Craft

**Status:** concluída em 2026-09-13.

## Objetivo

Deixar explícita a qualidade usada pelo scanner de Craft e permitir comparar as cinco qualidades
no painel de uma receita sem recalcular nem reordenar a tabela inteira.

## Problema confirmado

O engine já recebe `outputQuality`, mas a tela de Craft não publicava o controle. Sem parâmetro na
URL, todas as linhas eram calculadas silenciosamente com qualidade normal. Uma cotação recente de
outra qualidade podia existir e ainda assim o painel mostrava a cotação antiga da qualidade 1.

## Implementação

- adicionar o seletor `Qualidade` ao grupo `Item` somente na tela de Craft;
- guardar a qualidade global em `quality` na URL e usá-la no cálculo, ordenação e volume da tabela;
- adicionar `Qualidade analisada` ao painel expandido do Craft;
- iniciar o painel com a qualidade global, mas manter sua troca local ao painel aberto;
- recalcular com a qualidade local o extrato, os preços por cidade, o volume e a análise exata;
- não alterar Refino, Comida & Poções nem o seletor já existente da Calculadora.

## Critérios de aceite

- as cinco qualidades podem ser escolhidas no filtro do Craft;
- recarregar a página preserva a qualidade global;
- a linha aberta começa na qualidade global;
- mudar a qualidade da linha altera somente seu painel;
- fechar e abrir outra linha volta a usar a qualidade global;
- preço e volume consultam exatamente a qualidade mostrada no seletor.

## Testes

- leitura da qualidade global pela URL;
- regressão do painel com cotações diferentes por qualidade;
- `npm run lint`;
- `npm run typecheck`;
- `npm run test`;
- `npm run build`.

## Fora do escopo

A política de idade máxima dos preços é uma correção separada. Esta task elimina a qualidade 1
implícita, mas não muda o contrato de frescor do snapshot.
