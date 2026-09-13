# 08 — Shell novo: sidebar à esquerda, tela inteira

> Corrige `X05`. Absorve a task 3.6/03 (`ErrorBoundary`) e parte da 3.6/11 (erro visível).

## Objetivo

A tabela passar a ser a tela. Navegação, filtros e controles saem de cima do conteúdo e vão
para uma coluna à esquerda; o conteúdo ocupa toda a largura restante.

## Por que

Pedido direto do usuário, depois de usar o produto:

> "quero deixar a aba de navegação, filtros, checkboxes e etc tudo no lado esquerdo da tela,
> com os itens aparecendo no lado direito ocupando a maioria da tela, não do jeito que tá agora"

E o código concorda. Hoje:

- `AppShell.tsx:133,189` prendem **tudo** em `max-w-7xl` — 1280 px, num produto que é uma
  tabela densa de 10+ colunas. Em monitor widescreen sobra tela vazia dos dois lados enquanto a
  tabela rola horizontalmente.
- A navegação é uma linha no topo, e os filtros são **três blocos empilhados acima da tabela**
  (`production-pages.tsx:332-460`). Somados ao cabeçalho e à faixa de KPIs, a tabela — que é o
  produto — nasce abaixo da dobra.
- `docs/13-linguagem-visual.md` §1 já dizia que "a tabela **é** a tela, não um anexo dela". O
  layout nunca honrou isso.

Além disso, **não existe `ErrorBoundary` no projeto** (achado `E04` da Fase 3.5): erro de render
vira tela branca. O shell novo é o lugar certo para ele nascer, e é o que torna a task 3.6/03
desnecessária.

## O que implementar

1. **`src/components/shell/AppShell.tsx`** reescrito:
   - Sem `max-w-7xl`. `flex` de duas colunas: `aside` fixa (`w-72`) + `main` com `flex-1`.
   - A sidebar tem rolagem própria e altura de tela (`h-dvh sticky top-0`), para os filtros
     rolarem sem levar a tabela junto.
   - Ordem na coluna: marca → navegação → **slot de filtros da tela** → rodapé com servidor,
     tema e conta.
   - `main` sem padding lateral generoso: a tabela encosta na borda útil.

2. **Slot de filtros por `createPortal`.** A tela declara
   `<SidebarSection title="Filtros">…</SidebarSection>` e o conteúdo aparece na sidebar.

   Portal, e não estado em contexto, de propósito: guardar um `ReactNode` em `useState` obriga
   a tela a chamar `setState` durante o render do filho, que é render em cascata — o mesmo
   problema que o lint pegou na task 07.

3. **`src/components/shell/ErrorBoundary.tsx`** — class component com
   `getDerivedStateFromError` + `componentDidCatch`, envolvendo o `Outlet`. Renderiza o
   `EstadoErro` que já existe (`components/ui/states.tsx`), com ação de recarregar. Erro numa
   tela não pode apagar o shell: a sidebar continua navegável.

4. **Mobile** (`< md`): a sidebar inteira — navegação **e** filtros — colapsa no `Sheet` que já
   está instalado. Servidor e tema ficam numa barra superior fina, sempre visíveis: servidor
   errado é erro de leitura, não deveria exigir abrir menu para corrigir (regra que
   `13-linguagem-visual.md` §6 já tinha fixado e que continua valendo).

5. **`docs/13-linguagem-visual.md` §6 reescrito.** Ele decidiu header no topo; a decisão mudou
   e o documento tem que dizer a verdade. As §§1-5 (densidade `h-11`, `tabular-nums`,
   hierarquia, vocabulário de estado, badges de confiança) **continuam valendo** e passam a ser
   aplicadas de verdade nas tasks 10-11.

## Bibliotecas/dependências

Nenhuma nova. `Sheet` do shadcn já instalado; `createPortal` é do React.

## Depende de

Nada.

## Testes automatizados

- **`max-w-7xl` não existe mais no shell** — guard textual, porque é a regressão que devolveria
  o problema inteiro sem quebrar nenhum teste de comportamento.
- Navegação, servidor, tema e conta continuam alcançáveis (papéis e rótulos preservados).
- `SidebarSection` renderiza seu conteúdo **dentro da sidebar**, não no fluxo da página.
- **`ErrorBoundary`**: uma tela que lança durante o render vira `EstadoErro`, e a **navegação
  continua na tela** — é a diferença entre "essa tela falhou" e "o app morreu".
- O `ErrorBoundary` se recupera ao navegar para outra rota (não fica preso no estado de erro).
- `a11y.test.tsx` continua verde com o shell novo.

## Testes manuais

Só você consegue julgar:

1. Em monitor largo, a tabela usa a tela toda? Sobra faixa vazia nas laterais?
2. A sidebar rola sem levar a tabela junto quando os filtros crescem?
3. No mobile, dá para trocar de servidor sem abrir o menu?

## Estado da implementação

**Concluída.** `npm run lint` 0 erros (5 warnings pré-existentes) · `typecheck` limpo ·
`npm run test` **232/232** (+6) · verificada no navegador.

- **`src/components/AppShell.tsx`** reescrito: duas colunas, sem largura máxima.
- **`src/components/shell/SidebarSlot.tsx`** — `SidebarSection` via `createPortal`.
- **`src/components/shell/ErrorBoundary.tsx`** — dentro do shell, envolvendo só o `Outlet`.
- **`src/components/ui/states.tsx`** — `EstadoErro` passou a aceitar uma frase de descrição, em
  vez de nascer um quarto formato de erro (§3 de `13-linguagem-visual.md`).
- **`docs/13-linguagem-visual.md` §6 reescrita**, com o histórico da decisão revogada.

### O bug que só apareceu no navegador

A primeira versão usava `sticky top-0 h-dvh` na sidebar — e ela **rolava junto com a página**.
O `sticky` não tinha folga: num flex container, o `aside` estica até a altura da página inteira,
então não sobra espaço para ele grudar dentro do próprio box.

A correção foi trocar o modelo: `h-dvh overflow-hidden` no contêiner e rolagem própria em cada
coluna. Efeito colateral desejado — a tabela passa a ter uma região de rolagem própria, que é
exatamente o que o cabeçalho fixo da task 10 vai precisar.

**Nenhum teste teria pego isso.** jsdom não faz layout; sticky, overflow e altura de viewport
não existem lá. Foi preciso abrir o navegador, rolar e olhar.

### Guard em vermelho antes da correção

Reintroduzindo `max-w-7xl` no `main`, `no-max-width-shell.test.ts` falha com
`largura máxima no shell devolve o X05: max-w-7xl`.

O guard é textual porque a regressão é **invisível** para teste de comportamento: a classe não
quebra papel de acessibilidade, nem conteúdo, nem rota — só devolve o problema em silêncio.

Uma nota sobre o próprio guard: a primeira versão dele falhou contra a **docstring do shell**,
que cita `max-w-7xl` para explicar o que foi removido. Um guard que proíbe *falar* sobre o
defeito empurra a explicação para fora do código. Ele passou a ignorar comentários.

### Um teste existente mudou de forma

`AppShell.test.tsx` usava `getByRole('combobox', {name:'Servidor'})`. O shell novo renderiza os
controles de contexto **duas vezes** — rodapé da sidebar (desktop) e barra superior (mobile) —
alternados por `md:hidden`/`hidden md:flex`. jsdom não aplica CSS, então os dois aparecem na
consulta. O teste passou a afirmar o invariante que realmente importa (§6): os controles são
alcançáveis nos dois breakpoints **sem abrir menu nenhum**.

### Pendente pra você testar

O layout foi verificado por mim no navegador a 1600×900: sidebar fixa, conteúdo em largura
total, rolagem independente. O que **só você** pode julgar:

1. No seu monitor, a densidade está boa ou a sidebar de `w-72` (288 px) come tela demais?
2. Os filtros ainda estão no corpo da página — isso é a task 09, que os move para a sidebar.
   Vale conferir se a ordem que propus (navegação → filtros → servidor/tema/conta) é a que você
   quer, antes de eu construí-la.
