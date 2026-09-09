# 10 — Tabela do scanner

> Corrige `X01`/`X02` na superfície: a linha sem preço aparece. E inverte o guard de paginação.

## Objetivo

Uma tabela que ordena e filtra sobre o **conjunto inteiro**, mostra 5.523 linhas sem matar a
aba, e nunca esconde uma receita por conta própria.

## Por que

A tabela atual (`components/opportunities/OpportunityTable.tsx`) recebe uma **página** de 25
linhas do servidor. Toda a fase existe para desfazer isso: com o engine da task 05, o conjunto
inteiro está em memória, já calculado.

Renderizar 5.523 linhas × 12 colunas no DOM trava a aba. Virtualizar resolve **sem** reintroduzir
paginação: o universo continua completo, só o DOM é recortado.

## O que implementar

1. **`src/scanner/sorting.ts`** — ordenação sobre o conjunto, por `decimal.js`. Regra que carrega
   peso: **linha sem preço vai sempre para o fim, nas duas direções**. Ausência não é "o pior
   resultado"; ordená-la junto com número inventa uma posição que o dado não sustenta.

2. **`src/scanner/ScannerTable.tsx`** — virtualizada (`@tanstack/react-virtual`), cabeçalho
   fora da área rolável, densidade da §1 de `13-linguagem-visual.md` (linha de 44 px, número à
   direita com `tabular-nums`). A tabela **não ordena por conta própria**: ela pede, e a tela
   ordena sobre o conjunto. Se ordenasse localmente, ordenaria só o que está renderizado.

3. **`src/components/ItemImage.tsx`** — arte do serviço de render oficial, 64 px, `lazy`, com
   fallback no `onError`. Ver `docs/06-fontes-de-dados-estaticos.md`.

4. **Inverter o guard de paginação.** `no-client-paging-mutation.test.ts` (F08) proíbe
   ordenar/filtrar a página recebida — e **continua valendo** para Market Flip e Preços, que
   seguem paginadas pelo servidor. Para o scanner a regra se inverte, e o guard novo
   (`scanner-nao-pagina.test.ts`) protege o oposto: nada de reintroduzir paginação.

## Depende de

Tasks **05** e **08**.

## Estado da implementação

**Concluída.** `npm run lint` 0 erros (6 warnings pré-existentes) · `typecheck` limpo ·
`npm run test` **267/267** (+14).

- **`@tanstack/react-virtual@3.14.11`** (MIT, publicada 2026-09-07) — dependência nova, fixada.
- `src/scanner/sorting.ts`, `src/scanner/ScannerTable.tsx`, `src/components/ItemImage.tsx`.
- `src/test/scanner-nao-pagina.test.ts` — o guard invertido.
- Nota adicionada ao `no-client-paging-mutation.test.ts` explicando por que o scanner fica de
  fora dele, e onde a regra equivalente vive.

### O teste que eu removi, e por quê

Escrevi um teste de virtualização ("5.523 linhas entram, poucas existem no DOM"). Ele **passou**
— e passou errado: o cabeçalho também tem `role="row"`, então ele contava 1 e concluía que a
virtualização funcionava. Ao descontar o cabeçalho, o número real era **zero**: em jsdom o
virtualizador não renderiza linha nenhuma.

Tentei três correções — stub de `getBoundingClientRect`, polyfill de `ResizeObserver`,
`initialRect`. Nenhuma resolve, porque `@tanstack/react-virtual` depende de layout real e jsdom
não faz layout. Continuar significaria mockar a biblioteca (testando o mock) ou torcer o código
de produção para agradar o ambiente de teste.

**Removi o teste.** Um teste que não observa o que promete é pior que nenhum — é sinal verde sem
significado, exatamente o `W3` da task 09. No lugar ficaram duas coisas honestas:

- um guard textual contra a regressão real (voltar a paginar);
- a verificação no navegador na task 11, contando nós do DOM com layout de verdade.

Pelo mesmo motivo, o conteúdo das células passou a ser testado onde é puro: nas definições de
coluna (`cell(row, item)`), na task 11.

O `initialRect` ficou no código, mas com o comentário corrigido — ele serve ao primeiro paint em
produção, **não** ao jsdom, e dizer o contrário seria mentir para quem ler depois.

### Pendente pra você testar

Na task 11: rolar a tabela com as 5.523 receitas de craft e confirmar que continua fluida, e que
a arte dos itens carrega conforme rola (só a linha visível baixa).
