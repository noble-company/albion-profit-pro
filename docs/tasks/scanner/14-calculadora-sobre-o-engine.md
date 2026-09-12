# 14 — Calculadora sobre o engine

> Corrige `E05` (herdado da task 3.6/04, arquivada para esta).

## Objetivo

A Calculadora passa a calcular no navegador, com o mesmo engine do scanner: uma receita, todas as
cidades lado a lado, o número mudando enquanto o jogador digita. Só o "Analisar com o livro real"
vai à rede.

## Por que

- **É a tela mais largada do produto.** Campos crus escritos à mão, sem os primitivos do design
  system e sem foco visível; cada mudança é um `POST /craft/simulate` com botão "Simular craft".
- **`E05` continua aberto.** Sem cidade ou com quantidade 0 o botão não reage: as regras do
  `react-hook-form` bloqueiam o submit e não renderizam mensagem, sem `aria-invalid`.
- **Ela não conhece nada do que o scanner ganhou:** Painel do Destino (17), retorno por
  ingrediente (26), preço médio e escolha por item (24, 25), volume por dia (23). A mesma receita
  dava um número na tabela e outro na Calculadora.
- **O engine já responde a pergunta da tela.** `explainRow` calcula uma receita numa cidade com
  cenários, extrato, procedência de cada preço e preço de empate — é o painel expandido da linha.

## Decisões com o usuário (2026-09-12)

| # | Decisão |
|---|---|
| 1 | Os controles do cenário ficam **na barra da direita**, os mesmos do scanner. |
| 2 | **"Escopo: minha cobertura" sai.** O scanner não tem, e a análise exata usa `scope=all`. |
| 3 | **Todas as cidades lado a lado**, com o detalhe da melhor; clicar numa cidade troca o detalhe. |
| 4 | **"Abrir na Calculadora"** no painel da linha do scanner, levando o cenário junto. |

## O que implementar

1. **Barra do cenário compartilhada** — os grupos "Mercado" e "Seu cenário" saem de
   `ScannerPage.tsx` para um componente usado pelas duas telas. Mesmos parâmetros de URL
   (`qty`, `return_rate`, `station_fee`, `focus`, `premium`, `buy`, `sell`, `ing_price`,
   `sale_price`, `px`/`pc`/`sx`/`sc`, `sell_in`, `buy_in`); a Calculadora acrescenta `item` e
   `quality`.
2. **Detalhe da linha compartilhado** — o `renderDetail` do scanner (extrato, preço por cidade,
   origem dos preços, análise exata) vira um componente; a Calculadora mostra o mesmo painel.
3. **Calculadora** (`/calculadora`, `craft/pages.tsx`):
   - item escolhido pelo autocomplete (`?item=` continua abrindo — Market Flip e systray usam);
   - receita procurada nos catálogos de refino e de craft;
   - preço só do recorte da categoria do item (task 22), vendas no mesmo recorte (23);
   - `computeScanner` só com essa receita, uma linha por cidade de Vender em;
   - comparação por cidade ordenada por lucro — linha sem preço fica, com o motivo;
   - detalhe da cidade escolhida (a melhor, até o jogador clicar noutra).
4. **Erro no campo, não botão mudo (`E05`)** — sem submit, não há envio travado. Quantidade que
   não é inteiro ≥ 1 e retorno fora de 0–99% mostram a mensagem no próprio campo, com
   `aria-invalid` e `aria-describedby`; a conta segue com o valor seguro que a leitura da URL já
   usa. Vale para o scanner também, que usa o mesmo campo.
5. **"Abrir na Calculadora"** no painel da linha do scanner: a URL leva o item e o cenário, e
   deixa de fora o que é da tabela (categoria, Top, busca, filtros de resultado).

## Depende de

Tasks **05** (engine), **11.4** (painel da linha), **21-25** (barra e preços) e **17** (Painel do
Destino).

## Testes automatizados

- A receita é achada no catálogo certo (refino ou craft); item sem receita diz isso.
- O recorte do snapshot segue a categoria do item, pela mesma regra do servidor.
- As cidades saem ordenadas por lucro; sem preço vai para o fim, com o motivo; a cidade escolhida
  vence a melhor.
- A URL de "Abrir na Calculadora" leva item e cenário e descarta o que é da tabela.
- Quantidade `0` e retorno `150` mostram mensagem com `aria-invalid` e `aria-describedby`.
- Tela: sem item, pede o item; com `?item=`, mostra as cidades; mudar a quantidade recalcula **sem
  requisição nova**.
- `jest-axe` na Calculadora sem violação séria.

## Testes manuais

1. Abrir **Calculadora**, escolher um item e conferir a comparação por cidade contra o scanner.
2. Mexer em "Receitas a fazer" e no retorno: o número muda na hora, sem carregar.
3. Clicar em outra cidade: o detalhe troca. "Analisar com o livro real" continua funcionando.
4. No scanner, abrir uma linha e clicar em **Abrir na Calculadora**: a tela abre com o mesmo item e
   o mesmo cenário, e o lucro da cidade bate com o da linha.

## Estado da implementação

**Concluída (2026-09-12).** Frontend `npm run test` **561/561** (77 arquivos) · `typecheck` limpo ·
`lint` 0 erros (os mesmos 7 avisos de antes). Sem mudança de backend.

Guards vermelhos primeiro: 9 das funções puras e do campo (o módulo `calculadora` nem existia), 4
da tela e o `jest-axe` da Calculadora.

### O que existe agora

| Peça | Onde | O que faz |
|---|---|---|
| Barra do cenário | `scanner/BarraDoCenario.tsx` | "Mercado" e "Seu cenário", as mesmas no scanner e na Calculadora; a Calculadora liga `comQualidade` |
| Detalhe da receita | `scanner/DetalheDaLinha.tsx` | O painel da linha (extrato, preço por cidade, origem, análise exata) + "Abrir na Calculadora" |
| Calculadora | `craft/pages.tsx` | Autocomplete do item, catálogos de refino e de craft, recorte da categoria, `computeScanner` com uma receita, tabela "Lucro por cidade", detalhe da escolhida |
| Regras dela | `craft/calculadora.ts` | `receitaDoItem`, `linhasPorLucro`, `linhaEscolhida` |
| Recorte de uma receita | `categorias.ts` → `recorteDaReceita` | A mesma regra de `_na_categoria` do servidor |
| Link e mensagens | `tela.ts` → `hrefDaCalculadora`, `erroDaQuantidade`, `erroDoRetorno` | O link descarta `cat`, `top`, `q` e os filtros de resultado |
| Erro no campo | `FilterNumberField` → `error` | Mensagem fora do rótulo, `aria-invalid` e `aria-describedby` |

### Decisões que só apareceram implementando

- **A tela é testada dentro do `AppShell`.** Os controles do cenário são um portal para o slot da
  barra; fora do shell eles não existem, e o teste de "mudar a quantidade sem requisição" não teria
  campo para digitar.
- **O texto do autocomplete é local; a URL só recebe o item escolhido.** Com o campo ligado direto
  na URL, cada letra digitada virava um `item` inexistente e a tela piscava "Este item não tem
  receita".
- **Uma receita só roda na thread principal**, sem Worker: são 8 linhas, e a latência da mensagem
  seria maior que a conta.
- **O erro não bloqueia a conta.** A leitura da URL já trocava quantidade e retorno inválidos por
  valores seguros (task 11.2.1); o que faltava era dizer. A mensagem aparece no campo e a conta
  segue com o valor seguro — o jogador vê o número e sabe que não é o do campo.
- **`E05` sai de cena por construção**: não existe mais submit para ficar mudo. A preferência
  gravada em `localStorage` (`albion-profit-pro:calculator:v1`) também saiu — o cenário mora na URL,
  como no scanner.

### Pendente pra você testar

1. Abrir **Calculadora**, buscar um item (ex.: Espada Larga) e conferir as cidades em ordem de lucro.
2. Mexer em "Receitas a fazer" e no retorno: o número muda na hora, sem carregar. Digitar `0` na
   quantidade mostra a mensagem no campo.
3. Clicar noutra cidade na tabela: o detalhe troca. "Analisar com o livro real" continua funcionando.
4. No Craft, abrir uma linha e clicar em **Abrir na Calculadora**: mesmo item, mesmo cenário, e o
   lucro da cidade bate com o da linha.
