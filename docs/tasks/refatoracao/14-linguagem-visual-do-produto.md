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

---

## Estado da implementação

**Concluída.** `npm run typecheck` limpo · `npm run lint` 0 erros (6 warnings pré-existentes) ·
`npm run test` 80/80 em 15 arquivos · `npm run build` passa.

### O que entrou

- **[`docs/13-linguagem-visual.md`](../../13-linguagem-visual.md)** — as 6 decisões da spec
  (densidade de tabela, hierarquia, vocabulário de estado, sinalização de confiança,
  iconografia/microcópia, layout do shell), cada uma justificada contra o código real de hoje
  (`opportunities/pages.tsx`, `production-pages.tsx`, `warningLabels`).
- **`frontend/src/design/`** (novo, escopo de protótipo — não `components/ui/`):
  - `LinguagemVisualPage.tsx` — a página de referência, rota `/estilo`;
  - `ConfidenceBadge.tsx` + `confidence.ts` — demonstração dos 3 níveis de confiança
    (observação/atenção/sem dado) mapeados a partir dos 5 códigos de aviso do backend;
  - `TabelaCarregando.tsx` — skeleton no formato de linha de tabela (não um spinner genérico).
- **`App.tsx`** — rota `/estilo`, lazy, dentro de `RequireAuth`+`AppShell` (mesmo padrão do
  `/ui` da task 11). Chunk próprio no build (10,85 kB).
- **Testes:** `LinguagemVisualPage.test.tsx` — smoke (sem erro de console) e acessibilidade
  (`jest-axe`), `describe.each` nos dois temas (`data-theme='dark'|'light'`).
- devDeps `jest-axe@11.0.0` + `@types/jest-axe@3.5.9` (exact-pinned via `.npmrc`).

### O que **não** mudou (de propósito)

- `components/ui/` e `AppShell.tsx` reais — o vocabulário de confiança definitivo
  (`WarningBadges`) é extraído na **task 20**; o shell real é revisado na **task 24**. Esta
  task só decide e demonstra, pra essas duas tasks não inventarem de novo.
- Nenhuma tela do produto foi tocada.

### Desvios da spec

- **`color-contrast` desligado no axe.** jsdom não carrega o CSS compilado (Tailwind/tokens),
  então o axe não enxerga cor pintada nenhuma — rodar a regra geraria ruído, não sinal. O
  contraste real dos tokens já tem verificação de verdade em `src/test/contrast.test.ts`
  (tasks 12/13, com os valores reais e `culori`). O axe aqui cobre o que jsdom consegue
  verificar de verdade: estrutura de DOM, ARIA, rótulos, ordem de heading.
- **Critério "sem violação séria"** interpretado como filtrar por `impact` (`serious`/
  `critical`) em vez de zero violação — a spec já assume que pode haver achado menor/moderado
  tolerável numa página de referência.

### Testes automatizados

- `npm run typecheck` — limpo.
- `npm run lint` — 0 erros, 6 warnings pré-existentes (nenhum novo).
- `npm run test` — **80/80 em 15 arquivos**, incluindo os 4 novos (`LinguagemVisualPage.test.tsx`
  × 2 temas × {smoke, axe}). Os guards de cor (`no-color-literals`) e de ícone
  (`no-icon-chars`) passam sobre os arquivos novos.
- `npm run build` — passa; `/estilo` fica em chunk lazy próprio.

### Testes manuais que já rodei

Nenhum item da seção "Testes manuais" é verificável por mim — ela é explicitamente "revisão
visual com o responsável do produto". Só confirmei via teste automatizado que a página
renderiza e não tem violação séria de acessibilidade nos dois temas.

### Pendente pra você testar

1. `npm run dev`, entrar, abrir **`/estilo`** nos dois temas (Sistema/Claro/Escuro no
   `AppShell`) e revisar as 6 seções contra `docs/13-linguagem-visual.md`.
2. **Este é o critério de pronto da task**: aprovar (ou pedir ajuste) antes de a task 20
   começar a extrair `KpiCard`/`FilterPanel`/`OpportunityTable`/`WarningBadges` sobre essas
   decisões.
