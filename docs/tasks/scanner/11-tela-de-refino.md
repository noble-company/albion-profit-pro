# 11 — Tela de Refino

> A task que prova a arquitetura da fase ponta a ponta, na tela, com dado real.

## Objetivo

O jogador abrir `/refino`, ver **todas** as receitas de refino em todas as cidades — inclusive
as sem preço — e filtrar sem que nada vá à rede.

## O que implementar

1. **`src/scanner/usePriceSnapshot.ts`** — snapshot pela política `market` (30 s). Sem
   IndexedDB, ao contrário do catálogo: preço velho mais rápido é o oposto do que se quer.
2. **`src/scanner/columns.tsx`** — colunas com `cell` **puras** (é onde o conteúdo da tabela é
   testado, já que a virtualização não roda em jsdom — `W4`).
3. **`src/scanner/ScannerPage.tsx`** — a cadeia inteira em `useMemo`:
   `catálogo + snapshot → computeScanner → applyFilters → sortRows`.
4. **Filtros na sidebar** via `SidebarSection`, separando o que muda *quais* linhas existem do
   que muda o *valor* delas ("Seu cenário").
5. **Rota `/refino`** apontando para o scanner.

## Estado da implementação

**Concluída.** `npm run lint` 0 erros (6 warnings pré-existentes) · `typecheck` limpo ·
`npm run test` **274/274** (+7) · **verificada no navegador com dado real**.

### O que a verificação no navegador mostrou

| | |
|---|---|
| Linhas | **1.100** (110 receitas × 10 mercados) |
| Com preço | **413** de 1.100 |
| Filtrar por tier T6 | 1.100 → **200 linhas** |
| Requisições ao backend ao filtrar | **zero** |

A afirmação central da fase está provada na aba de rede: depois das duas cargas iniciais
(`/catalog/recipes` e `/prices/snapshot`), clicar num chip de tier não gera **nenhuma**
requisição — a tabela responde no mesmo frame.

E o `X01`/`X02` está visivelmente invertido: linhas de 28 h aparecem, com a idade escrita
("há 28 h · desatualizado"), porque o filtro de idade nasce **sem limite**. A coluna `FONTE`
mostra `aodp`, `client` ou `aodp, client` por linha — a procedência que a task 03 tornou
possível guardando `source` por lado.

### Uma regra do design system que precisou mudar

A §2 de `13-linguagem-visual.md` dizia: lucro é **sempre** `text-profit`, nunca cor condicional.
Fazia sentido quando o produto só mostrava linha lucrativa.

O scanner inverteu isso — mostrar o que **não** dá lucro virou o padrão, a pedido do usuário. Na
tela real, a maioria do refino T6 é prejuízo. Pintar tudo de verde não seria consistência, seria
induzir a erro num número que a pessoa vai usar para decidir.

**Regra vigente:** `text-profit` quando positivo, `text-danger` quando negativo. A §2 foi
reescrita com o motivo, em vez de eu violá-la em silêncio.

### Um teste de desempenho que ficou instável

O teste dos filtros media 2,5 ms isolado e **estourava** o teto de 16 ms sob a suíte inteira em
paralelo — contenção de CPU, não regressão. Teto subiu para 500 ms, com o motivo escrito: ele
existe para pegar regressão de **ordem de grandeza**, não para medir a máquina do CI. Um limite
apertado ali só produziria falha intermitente, que é pior que teste nenhum.

### Uma escolha de produto que vale você revisar

O README da fase previa "8 cidades **lado a lado**" (colunas por cidade, como a sua planilha).
Entreguei **uma linha por receita × cidade**, com a cidade como coluna e ordenação por lucro.

Motivo: para "onde vale mais refinar isto", ordenar por lucro e ler o topo responde direto,
enquanto 8 colunas obrigam a comparar com o olho. E funciona com a tabela que já existe. Mas é
uma substituição, não o que estava escrito — se você quiser as colunas por cidade, é uma task
curta em cima do que já está pronto.

### Pendente pra você testar

1. **A conta.** Pegue uma linha com preço e confira contra o mercado do jogo — o scanner é
   estimativa de topo de livro, então deve bater quando a profundidade não move o preço.
2. **Densidade.** A tabela tem 10 colunas; no seu monitor sobra ou falta espaço?
3. **A coluna "Dado de"** fica apertada com "há 28 h · desatualizado". Vale encurtar?
4. **Lucro/foco** aparece só com "Usar foco" ligado — está claro, ou parece coluna quebrada?
