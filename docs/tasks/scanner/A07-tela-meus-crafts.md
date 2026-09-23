# A07 — Tela Meus Crafts

> Ajuste depois do fechamento da Fase 4. Depende da
> [A06](A06-meus-crafts-persistencia-e-favoritos.md).

## Objetivo

Criar `/meus-crafts`, uma bancada pessoal que calcula somente as receitas salvas do realm atual,
acompanha preço, giro e frescor, e permite abrir ou remover cada registro.

## Princípio de produto

O scanner responde **“o que parece interessante agora?”**. Meus Crafts responde **“como estão as
receitas que eu escolhi acompanhar?”**. A tela não duplica o catálogo nem a Calculadora: carrega as
configurações pessoais do backend, recebe dados de mercado e usa o mesmo engine no navegador.

## Recorte eficiente dos dados

Estender os endpoints existentes para aceitar `output_item` repetido:

- `GET /prices/snapshot?server=west&output_item=A&output_item=B`;
- `GET /prices/sales?server=west&output_item=A&output_item=B`.

Regras:

- máximo de 200 valores, sem repetição depois da normalização;
- incompatível com o recorte por categoria: enviar os dois formatos responde 422;
- no snapshot, cada saída expande para seus ingredientes e recurso de upgrade, como o recorte por
  categoria já faz;
- no sales, somente as saídas pedidas entram;
- lista ordenada para chave de cache e consulta: A+B e B+A são o mesmo recorte. Esses endpoints
  dinâmicos não publicam `ETag`; não criar um validador parcial que possa ignorar preço novo;
- nenhum endpoint novo de “ranking” ou cálculo no servidor.

Regenerar o OpenAPI e os tipos do frontend.

## Interface

Adicionar **Meus Crafts** à navegação principal e a rota autenticada `/meus-crafts`.

### Cabeçalho

- título e frase curta;
- `N crafts salvos · X com cotação atual`;
- idade máxima do dado, padrão **24 h**, editável e persistida na URL como `max_age`;
- atualização a cada 30 s somente com a aba visível.

### Tabela

Uma linha por `SavedCraft`, inclusive quando dois registros apontarem para o mesmo `output_item`.

| Coluna | Conteúdo |
|---|---|
| Item | imagem, nome, tier/encantamento e qualidade |
| Plano | quantidade inicial e rendimento final |
| Mercado | cidade e modo de compra/venda usados |
| Investimento | custo total do lote |
| Vende/dia | histórico da qualidade escolhida |
| Atualização | lado mais antigo que realmente entrou na conta |
| Lucro | total e por unidade |
| ROI | percentual |
| Ações | abrir, Calculadora para craft ou aba Refino para recurso refinado, e remover |

Ordenação por nome, lucro, ROI, investimento, volume e atualização. A tabela ocupa a altura útil e
usa os mesmos tokens, escala de conteúdo, coluna fixa e virtualização do scanner.

### Linha expandida

Reutilizar `DetalheDaLinha`/`RowDetails`: extrato, origem dos preços, cidades, cenários e análise
exata. Na A07, quantidade e qualidade vêm do registro e ainda são somente leitura; a edição entra
na A08.

### Estados

- vazio: explica como salvar uma receita e oferece links para Refino, Craft e Comida & Poções;
- item removido do catálogo: registro continua removível e aparece como `Receita indisponível`,
  sem derrubar a tela;
- erro de favoritos é diferente de erro de catálogo/preços;
- remoção pede confirmação dentro da linha e atualiza o cache depois do `204`.

## Frescor — regra obrigatória

Preço acima de `max_age` **não participa do engine**. Antes de calcular, o índice usado por Meus
Crafts transforma cada lado vencido em ausente. A receita permanece na tabela como `Sem cotação
atual`, com o lado faltante; ela não mostra lucro calculado com preço vencido.

A idade bruta continua disponível apenas na procedência do dado para diagnóstico, marcada como
vencida. O padrão de 24 h é desta tela; mudar a política geral do scanner continua fora desta task.

## Cálculo

1. Buscar favoritos do realm, catálogo completo de craft e refino, snapshot e sales no recorte
   das saídas salvas.
2. Separar registros válidos dos que não existem mais no catálogo.
3. Sanitizar o índice pelo `max_age`.
4. Calcular apenas as receitas salvas. Entradas duplicadas reutilizam catálogo e índices, mas cada
   uma conserva quantidade e qualidade próprias.
5. Nunca chamar `POST /craft/simulate` para montar a lista; ele só roda ao clicar em Analisar.

Até a A08, as premissas ainda não persistidas usam os padrões oficiais do scanner: Premium
ligado, retorno e taxa de estação zero, foco desligado, modos de compra/venda `best`, ingredientes
pela média, venda pelo melhor cenário e todas as cidades. Quantidade e qualidade vêm de cada
`SavedCraft`.

## Testes automatizados

Backend:

- recorte por `output_item` inclui saída, ingredientes e upgrade sem vazar outras receitas;
- sales devolve somente as saídas pedidas;
- ordem/repetição não muda a chave de cache nem o recorte retornado;
- conflito com categoria e mais de 200 itens respondem 422;
- statements constantes em relação ao número de itens;
- suíte, ruff e teste do contrato inglês.

Frontend:

- vazio, erro separado e receita removida do catálogo;
- duas entradas iguais continuam duas linhas;
- somente receitas salvas chegam ao engine;
- preço com 23 h calcula e preço com 25 h vira `Sem cotação atual` no padrão;
- mudar `max_age` refaz a conta local sem nova consulta de catálogo;
- ordenação, expansão, remoção confirmada e link para Calculadora ou Refino conforme a receita;
- acessibilidade, lint, typecheck, suíte completa, build e Playwright.

## Testes manuais

1. Salvar receitas em Refino, Craft e Comida & Poções; todas aparecem no realm correto.
2. Confirmar atualização a cada 30 s com a aba visível e pausa em segundo plano.
3. Abrir uma linha e comparar o extrato com a Calculadora.
4. Usar um `max_age` menor que a idade da cotação; lucro desaparece e o motivo fica visível.
5. Remover um registro e atualizar a página; ele não volta.
6. Conferir tema claro/escuro, mobile e Tamanho do conteúdo até 220%.

## Fora do escopo

- editar quantidade/qualidade e demais premissas — A08;
- grupos, notas, metas de compra e histórico de variação;
- alterar a política de frescor das demais telas.

## Estado da implementação

**Concluída em 2026-09-14.**

### Entregue

- `output_item` repetido em snapshot e sales, com normalização, limite de 200, conflito explícito
  com categoria e expansão da receita em uma consulta de statements constantes;
- rota autenticada `/meus-crafts`, navegação principal e carregamento dirigido somente às saídas
  salvas do realm;
- cálculo no mesmo engine do scanner, uma linha por UUID mesmo para itens repetidos, com quantidade
  e qualidade do registro e premissas oficiais até a A08;
- tabela virtualizada na altura útil com item, plano, mercado, investimento, giro, frescor, lucro,
  ROI e ações; ordenação em todos os campos previstos;
- `max_age` na URL e sanitização por lado antes do engine. A observação bruta vencida aparece só no
  diagnóstico da linha aberta e nunca sustenta lucro;
- detalhe compartilhado em modo somente leitura, link para Calculadora ou Refino conforme a
  receita e confirmação interna de remoção com atualização do cache após o `204`;
- estados separados para favoritos, catálogo, preços, sales, lista vazia e receita removida do
  catálogo.

### Validação automatizada

- backend completo: `484 passed, 1 skipped`; `uv run ruff check .` limpo;
- frontend completo: `83 files, 594 passed`; acessibilidade da rota vazia incluída;
- cobertura: 96,77% statements, 92,16% branches, 96,38% functions e 97,81% lines;
- `npm run lint`, `npm run typecheck` e `npm run build` concluídos sem erro; o lint mantém 8 warnings
  conhecidos de Fast Refresh/React Compiler, incluindo o mesmo aviso inevitável do TanStack Virtual
  já presente na tabela do scanner;
- Playwright real: `saved-crafts.spec.ts`, `1 passed`, contra API atualizada, PostgreSQL e Redis;
- o OpenAPI foi regenerado em `frontend/src/api/schema.d.ts`.

### Validação ainda manual

Os seis cenários da seção **Testes manuais** continuam como conferência humana de tema, mobile,
escala, pausa do polling em segundo plano e comparação visual com a Calculadora. O fluxo real de
criar, listar, remover e recarregar já foi coberto pelo Playwright.

### Correção de escopo — Refino (2026-09-14)

Refino passou a participar de Meus Crafts de ponta a ponta: o backend aceita receitas
`production_kind = refining`, a estrela aparece na tabela e no detalhe da aba, e a bancada carrega
o catálogo sem restringir `kind`. A ação secundária de uma receita refinada retorna à aba Refino,
pois a Calculadora dedicada continua sendo de craft.

Validação da correção: backend focado `12 passed`, backend completo `484 passed, 1 skipped`,
frontend focado `14 passed`, frontend completo `83 files, 594 passed`, typecheck, Ruff, lint e build
sem erros. Permanecem somente os 8 warnings conhecidos do lint.
