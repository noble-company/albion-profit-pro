# Linguagem visual do produto

> Task 3.5/14. Não corrige um achado isolado — é o que impede que `F01` (sem biblioteca de
> componentes), `F02` (sem tokens) e `F05` (componentes duplicados) voltem quando o bloco 4
> (tasks 20-24) reconstruir as telas. Decide **antes** de reconstruir; não reconstrói nada
> aqui — a prova viva é `/estilo`, uma rota de desenvolvimento, não uma tela do produto.

## 0. Contexto: por que isto precisa ser decidido uma vez só

`opportunities/pages.tsx` (699 linhas) e `opportunities/production-pages.tsx` (862 linhas) foram
escritas cada uma por conta própria: `Kpi` copiado byte a byte, `p-4` em toda célula, três
formatos de estado vazio, `tracking-[0.28em]` num lugar e `tracking-[0.18em]` em outro. A task 12
deu um sistema de cor; esta task dá o resto — densidade, hierarquia, estado, confiança, ícone,
microcópia e shell — para que as tasks 20-24 apliquem uma regra, não inventem de novo.

---

## 1. Densidade e leitura de tabela

O produto é um scanner de mercado: a tabela **é** a tela principal, não um anexo dela.

| Decisão | Valor |
|---|---|
| Altura de linha | `h-11` (44px) — compacta o bastante pra caber ~15 linhas numa tela de laptop sem parecer espremida; nunca `p-4` (16px) em toda célula como hoje, que empurra a tabela pra fora da dobra com 8 linhas. |
| Padding de célula | `px-3 py-2` (não `p-4`). |
| Alinhamento | Texto (item, cidade, modo) à **esquerda**. Todo número (preço, taxa, quantidade, lucro, ROI) à **direita**, com `tabular-nums` — dígitos alinham entre linhas, o olho lê a coluna, não a linha. |
| Largura de coluna | Cada coluna numérica tem `min-width` fixo calculado pelo maior valor plausível (ex.: preço até 8 dígitos + separador), não `auto`. Colunas de texto (`item`, `cidade`) crescem. |
| Overflow | A tabela inteira rola horizontalmente dentro do próprio card (`overflow-x-auto`), **nunca** o card cresce além do card — hoje `min-w-[1120px]` empurra a página inteira pro lado no mobile. Card fixo, `<table>` interno com `min-width` próprio. |
| Cabeçalho | `sticky top-0` dentro do container com scroll, com `bg-surface` opaco (não translúcido) — sem isso o texto passa por baixo do cabeçalho ao rolar. |
| Mobile (`< 640px`) | Não vira lista de cards (perde a comparação lado a lado, que é o valor do scanner). Mantém tabela + scroll horizontal; as 3 colunas de "meio segundo" (item, lucro, ROI) ficam fixas (`sticky left-0`) pra orientar durante o scroll. |

**Antes → depois:** `<th className="p-4">` em todo cabeçalho → `<th className="h-11 px-3 text-right tabular-nums">` (ou `text-left` pra texto). Ver `/estilo`.

---

## 2. Hierarquia da informação

O jogador decide em meio segundo se aquela linha vale abrir. O que precisa entrar nesse meio
segundo, e o que pode esperar:

| Nível | Campos | Peso visual |
|---|---|---|
| **Primário** (meio segundo) | Item, **lucro**, **ROI**, rota (compra → venda) | `font-bold`/`font-semibold`, `text-foreground` ou `text-profit` no lucro, tamanho normal a +1 nível |
| **Secundário** (ao ler a linha) | Preço de compra/venda, qualidade, quantidade | peso normal, `text-foreground` |
| **Terciário** (contexto, não decisão) | Taxas, modo de aquisição/venda, cidade em texto pequeno abaixo do preço | `text-foreground-subtle`, `text-xs` |

Isso já é o padrão real do produto hoje (`formatarLocalidade` sob o preço em `text-xs`) — a
task 14 só nomeia a regra pra ela parar de ser acidental. Lucro é **sempre** `text-profit`,
nunca cor condicional por valor (positivo/negativo já é uma decisão de produto tomada na task
04 — o campo é lucro líquido, não uma variação de sentimento).

---

## 3. Vocabulário de estado

Hoje existem pelo menos três formatos de estado vazio escritos à mão. Um padrão por estado,
sem exceção:

| Estado | Padrão | Onde vive |
|---|---|---|
| **Carregando** | Skeleton com a **forma do conteúdo** — linhas de tabela fantasma (mesmas colunas, altura `h-11`), não um spinner nem o texto "Carregando…" sozinho. Texto vai para `sr-only` (leitor de tela lê, olho não). | `Carregando` (genérico) e `TabelaCarregando` — a task 21 moveu esta para `components/opportunities/` e a plugou como o estado `loading` de `OpportunityTable`. |
| **Vazio** | Ícone lucide neutro + título + 1 frase explicando que ausência de dado ≠ ausência de lucro (ver §5, microcópia). Nunca "Nenhum resultado" sozinho. | `EstadoVazio` (`components/ui/states.tsx`), já real. |
| **Erro** | Cartão com borda `danger`, ícone de alerta, e ação de retry quando fizer sentido (não em toda ocorrência — só quando a operação é re-tentável). | `EstadoErro` (`components/ui/states.tsx`), já real. |
| **Dado velho** (`stale`) | Não é um estado de tela — é uma anotação **na própria linha/badge** (ver §4). Frescor velho não impede a leitura, só marca a confiança mais baixa. |
| **Cobertura parcial** | Idem: anotação de confiança, nunca substitui a linha por um estado vazio — cobertura parcial ainda é dado, só que incompleto. |

`Carregando`, `EstadoVazio` e `EstadoErro` já existem e já são reais (task 11); esta task não os
reescreve, só fixa que **são** o vocabulário — nada de um quarto formato nascer numa tela nova.

---

## 4. Sinalização de confiança

A taxonomia de avisos do backend (`warning_labels` em `production-pages.tsx` /
`opportunities/pages.tsx`) é tratada hoje como badge cinza indistinta — todo aviso parece do
mesmo peso. Isso esconde justamente o que é diferencial do produto: ele é honesto sobre o que
não sabe. Três níveis, não quatro badges soltas:

| Nível | Significa | Cor/token | Avisos do backend |
|---|---|---|---|
| **Observação** (info) | O resultado é válido, mas depende de uma condição que vale saber | `info` | `ordem_nao_garantida` |
| **Atenção** (warning) | O resultado pode estar otimista — dado mais velho que o ideal, ou baseado em pouca profundidade de livro | `warning` | `dado_velho`, `profundidade_insuficiente` |
| **Sem dado** (neutro, não é erro) | Não há preço pra essa combinação — ausência, não zero | `foreground-subtle` + ícone, **não** `danger` (não é uma falha do sistema) | `sem_cobertura`, `sem_preco` |

Cada nível tem **um** ícone fixo (§5) e aparece como badge pequena ao lado do item, nunca
como texto solto na célula — pra ficar escaneável junto com o resto da linha, na mesma leitura
de meio segundo do §2. O componente de demonstração é `ConfidenceBadge` em `/estilo`; a versão
definitiva e reutilizável (`WarningBadges`) é extraída na task 20.

---

## 5. Iconografia e microcópia

**Ícones** — conjunto fechado, um por conceito, todos `lucide-react` (task 11). Não introduzir
um segundo ícone pro mesmo conceito em telas diferentes:

| Conceito | Ícone |
|---|---|
| Estado vazio / sem dado | `Inbox` |
| Erro / falha de carregamento | `AlertTriangle` |
| Observação (confiança, nível info) | `Info` |
| Atenção (confiança, nível warning) | `AlertCircle` |
| Lucro / tendência positiva | `TrendingUp` |
| Fluxo de compra ↔ venda | `ArrowLeftRight` |
| Menu / navegação | `Menu` |
| Fechar | `X` |
| Frescor / tempo | `Clock` |

**Microcópia** — regra de tom, com o exemplo que já existe no produto como modelo:

> "A ausência de dados não representa lucro zero."

1. **Nunca** confundir "sem dado" com "sem lucro" ou "erro" — a frase acima é o padrão, não a
   exceção; todo estado vazio de oportunidade deveria ser uma variação dela.
2. Frase curta, uma ideia, sem jargão de sistema ("payload", "endpoint", "null") — o público é
   jogador, não desenvolvedor.
3. Avisos de confiança (§4) descrevem a **limitação do dado**, não uma instrução ("Preço
   desatualizado", não "Atualize a página").
4. Português do Brasil, sem gírias regionais que não traduzem bem pra quem joga em qualquer
   fuso — o mesmo registro neutro que `formatarIdade`/`formatarSilver` já usam.

---

## 6. Layout do shell

Hoje: uma linha de links de texto com dois `<select>` no meio (servidor, tema), que vira um
bloco solto empilhado no mobile (`AppShell.tsx` atual). Estrutura definitiva — **decidida aqui,
implementada na task 24** (não nesta task; `AppShell.tsx` real não muda ainda):

- **Header fixo** (`sticky top-0`), altura constante, com três zonas: marca (esquerda) · navegação
  principal (centro, vira menu `Sheet` no mobile em vez de bloco empilhado) · controles de
  contexto (direita: servidor, tema, sessão).
- **Navegação principal** vira ícone + rótulo (não só texto) nos itens de tela (Market Flip,
  Refino, Craft, Itens, Calculadora, Tokens) — consistente com o resto do produto usar ícone por
  conceito (§5).
- **Controles de contexto** (servidor/tema) deixam de ser `<select>` nativo solto no meio da
  navegação e viram o `Select`/`DropdownMenu` do shadcn (task 11), agrupados à direita, sempre
  visíveis (não somem no menu mobile — servidor errado é um erro de leitura, não deveria exigir
  abrir o menu pra corrigir).
- **Mobile**: o menu principal colapsa num `Sheet` lateral (task 11 já instalou o componente);
  servidor/tema continuam na barra superior.

Maquete ilustrativa em `/estilo` (não funcional — não troca de rota nem persiste estado; é
só a estrutura visual pra aprovação).

---

## 7. Página de referência

`frontend/src/design/LinguagemVisualPage.tsx`, rota `/estilo` (dev, dentro de `RequireAuth` +
`AppShell`, lazy). Demonstra ao vivo, nos dois temas, cada seção acima — é o artefato que o
responsável do produto revisa antes da task 20 começar (critério de pronto desta task).

Os componentes de demonstração que ainda não têm dono definitivo (`ConfidenceBadge`,
`TabelaCarregando`) vivem em `src/design/`, não em `src/components/ui/` — evita a task 20
"extrair" algo que já foi extraído com o nome errado. `Carregando`/`EstadoVazio`/`EstadoErro`
são reaproveitados de `components/ui/states.tsx` porque já são reais.
