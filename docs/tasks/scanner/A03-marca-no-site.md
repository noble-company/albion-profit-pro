# A03 — Marca no site

> Ajuste depois do fechamento da Fase 4 ([README](README.md#ajustes-depois-do-fechamento)). Não
> reabre a contagem da fase. O ícone do client fica na [A04](A04-icone-do-client-com-a-marca.md),
> que usa os arquivos que esta task organiza.

## Objetivo

O site passa a usar a marca do produto: ícone na aba do navegador, escudo "AP" ao lado do nome na
navegação e logo completo nas telas de login e cadastro. Os originais ganham pasta própria, e as
versões que o site carrega são leves e geradas por script — nunca editadas à mão.

## Por que

Conferido em 2026-09-13:

| # | Situação | Evidência |
|---|---|---|
| 1 | **O site não tem favicon.** A aba mostra o ícone genérico do navegador. | `frontend/index.html` sem `<link rel="icon">`; `frontend/public/` vazio |
| 2 | **A marca é só texto**, e com a navegação recolhida (`w-14`) não aparece nada — só o botão de expandir. | `frontend/src/components/AppShell.tsx:286-293`, `:324` |
| 3 | **Login e cadastro** abrem com "Albion Profit Pro" em letra pequena, maiúscula, acima do título. | `frontend/src/auth/pages.tsx:27-29` |
| 4 | **Os arquivos que chegaram não servem como estão.** Os quatro têm 1254×1254 px e ~2 MB cada — carregar isso a cada visita é inaceitável. Os dois `.ico` são PNG com a extensão trocada (assinatura `89 50 4E 47`), não ícone de verdade. | `favicon.ico`, `favicon_nobg.ico`, `logo.png`, `logo_nobg.png` na raiz |

### Os arquivos na raiz

| Arquivo | O que é | Uso |
|---|---|---|
| `logo_nobg.png` | Logo completo (escudo, bigorna, "ALBION PROFIT PRO"), **fundo transparente** | Original do logo |
| `favicon_nobg.ico` | Escudo "AP", **fundo transparente** — um PNG, apesar da extensão | Original do escudo |
| `logo.png`, `favicon.ico` | As mesmas artes com fundo cinza-claro opaco | Nenhum: no tema escuro viram um quadrado cinza em volta do escudo |

As versões transparentes foram conferidas sobre os fundos do tema escuro e do claro, em 256, 128,
32 e 16 px: recorte limpo, sem halo. O escudo continua reconhecível em 32 px; em 16 px sobra a
silhueta, o esperado de um favicon. O logo completo **não** serve para tamanho pequeno — o texto
some abaixo de ~120 px.

## O que implementar

### 1. Originais em `assets/marca/`

| Destino | Origem |
|---|---|
| `assets/marca/logo.png` | `logo_nobg.png` |
| `assets/marca/escudo-ap.png` | `favicon_nobg.ico` (renomeado para a extensão real) |

As versões opacas (`logo.png`, `favicon.ico` da raiz) **saem do repositório** — confirmar com o
usuário antes de apagar, porque foram adicionadas por ele. A raiz fica sem imagem solta.

Os originais ficam no Git (~4 MB): são a fonte de tudo que for gerado, e a A04 também parte deles.

### 2. Script que gera as versões leves

`scripts/gerar_marca.py`, com **Pillow** — biblioteca estabelecida, que grava `.ico` com vários
tamanhos (`save(..., sizes=[...])`) e WebP com transparência. Não é dependência do projeto: roda
com `uv run --with pillow==<versão atual, conferida na hora> python scripts/gerar_marca.py`.

As saídas **vão para o Git**. O build do frontend não pode depender de Python, e um arquivo gerado
e versionado é revisável no PR.

| Saída | Tamanho | Para quê |
|---|---|---|
| `frontend/public/favicon.ico` | 16, 32 e 48 px num arquivo só | Aba do navegador, favoritos |
| `frontend/public/apple-touch-icon.png` | 180 px, **com fundo** (a cor de `--background` do tema escuro) | Atalho na tela inicial do iPhone — o iOS preenche transparência de preto |
| `frontend/src/assets/marca/escudo-ap.webp` | 64 px (2× o tamanho exibido) | Navegação |
| `frontend/src/assets/marca/logo.webp` | 352 px (2× o tamanho exibido) | Login, cadastro e README |

Orçamento: **escudo ≤ 10 KB, logo ≤ 60 KB, favicon ≤ 15 KB.** Medir e registrar no bloco de estado;
se o WebP com perda borrar a borda do escudo, usar sem perda e medir de novo.

O script é idempotente — rodar duas vezes sem mudar o original não muda nenhum byte — e falha se o
original não tiver canal alfa (é assim que a versão opaca não volta por engano).

### 3. `frontend/index.html`

```html
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

O caminho absoluto vale com o `base` padrão do Vite (hoje não há `base` em `vite.config.ts`). Se a
task 3.6/13 servir o site fora da raiz, o caminho acompanha — conferir lá.

### 4. Navegação (`AppShell.tsx`)

As imagens entram por `import` (o Vite põe hash no nome, e o arquivo pode ficar em cache longo).

- **Expandida:** escudo (`size-7`) à esquerda de "Albion Profit Pro", os dois dentro do mesmo link
  para `/`. O texto continua sendo o nome acessível; a imagem é decorativa (`alt=""`).
- **Recolhida (`w-14`):** o escudo aparece sozinho, como link para `/` com `aria-label` — hoje a
  marca some. A linha tem 56 px, e escudo mais botão de expandir não cabem lado a lado: o escudo
  vai em cima, o botão logo abaixo, sem empurrar a lista de telas para fora da vista.
- **Menu do celular (`Sheet`):** escudo ao lado do título.
- A navegação não escala com o Tamanho do conteúdo (§6 do doc 13) — o escudo também não.

### 5. Login e cadastro (`auth/pages.tsx`)

O `AuthCard` troca a linha "Albion Profit Pro" em maiúsculas pelo logo completo, centralizado acima
do título, em `size-44` (176 px). `alt="Albion Profit Pro"`: o nome continua lido por leitor de
tela. O título ("Entrar", "Criar conta") e o resto do cartão não mudam.

### 6. README da raiz

O logo no topo do `README.md`, com largura de 160 px, apontando para
`frontend/src/assets/marca/logo.webp` (o original de 2 MB não). O gate ignora imagem na checagem de
links (`verify_repository.py`, `MARKDOWN_LINK` exclui `![...]`); conferir no GitHub que aparece.

### 7. Documentação

`docs/13-linguagem-visual.md` ganha uma seção curta de marca: onde mora o original, como gerar,
que o escudo é para tamanho pequeno e o logo completo só a partir de ~120 px, e que nenhuma versão
leve é editada à mão.

## Depende de

Nada. É independente da A01 e da A02.

## Fora de escopo

- **Manifesto de PWA** (`site.webmanifest`, ícones 192/512, instalar como aplicativo): o produto
  é usado ao lado do jogo no desktop; vira task se o uso pedir.
- **Mudar cores do tema para combinar com o logo**: o dourado do logo já conversa com o âmbar que
  é a cor de marca dos tokens (`index.css:49`, `:81`). Nenhum token muda.
- **Tela de carregamento com o logo.**
- **Ícone do client** — [A04](A04-icone-do-client-com-a-marca.md).

## Testes automatizados

- **Guard novo nasce vermelho** — `src/test/marca.test.ts`, rodado antes de gerar os arquivos e
  registrado abaixo:
  - `public/favicon.ico` e `public/apple-touch-icon.png` existem, e o `.ico` começa com a
    assinatura de ícone (`00 00 01 00`), não de PNG;
  - `index.html` referencia os dois;
  - cada arquivo de `src/assets/marca/` respeita o orçamento de peso.
- `AppShell.test.tsx`: a marca aparece com a navegação expandida **e** recolhida, com nome
  acessível nos dois casos.
- `auth/auth.test.tsx`: nas telas de login e cadastro, o logo tem `alt="Albion Profit Pro"`.
- `a11y.test.tsx` segue verde (sem imagem sem `alt`).
- `npm run lint && npm run typecheck && npm run test && npm run build` — o build confirma que os
  `import` de imagem resolvem.
- Script: rodar duas vezes e conferir com `git status` que a segunda não muda nada.

## Testes manuais

1. Aba do navegador (Chrome e Edge) com o escudo, no tema claro e no escuro do navegador.
2. Navegação expandida e recolhida, nos dois temas: escudo nítido, sem quadrado em volta, e a lista
   de telas no mesmo lugar.
3. Tamanho do conteúdo em 220%: o escudo da navegação não muda.
4. Sair e abrir o login: logo centralizado, nítido, nos dois temas; o mesmo no cadastro.
5. README no GitHub com o logo no topo.

## Estado da implementação

**Concluída em 2026-09-13.**

### Entregue

- Originais transparentes organizados em `assets/marca/`; as duas versões opacas autorizadas
  foram removidas e a raiz ficou sem imagens soltas.
- `scripts/gerar_marca.py` usa Pillow 12.3.0, exige canal alfa e gera de forma idempotente o ICO
  multirresolução, o Apple Touch Icon com fundo e os dois WebPs leves.
- Favicon e Apple Touch Icon ligados no HTML; escudo presente na navegação aberta, recolhida e
  mobile; logo completo presente no login, cadastro e README.
- A regra de uso e regeneração da marca foi incorporada ao documento 13.

### Tamanhos gerados

| Arquivo | Bytes | Orçamento |
|---|---:|---:|
| `frontend/public/favicon.ico` | 9.158 | ≤ 15 KB |
| `frontend/public/apple-touch-icon.png` | 45.721 | — |
| `frontend/src/assets/marca/escudo-ap.webp` | 2.952 | ≤ 10 KB |
| `frontend/src/assets/marca/logo.webp` | 33.052 | ≤ 60 KB |

### Verificação executada

- Guard vermelho antes da implementação: 5 falhas esperadas (arquivos, shell, login e cadastro),
  com 13 testes restantes verdes nos três arquivos focados.
- Focados depois da implementação: 24/24, incluindo acessibilidade.
- Suíte completa: 568/568 testes em 76 arquivos; typecheck e build verdes; lint sem erros e com
  os 7 avisos preexistentes.
- Gerador executado duas vezes: os quatro SHA-256 permaneceram idênticos.
- Playwright contra a stack real: 1/1, cobrindo login, shell expandido/recolhido, tema escuro e
  conteúdo em 220% sem escalar o escudo.
- Inspeção visual dos quatro originais e das três artes raster geradas: transparência, recorte e
  leitura adequados nos tamanhos destinados.

### Desvio mínimo

- `frontend/public/` não estava vazio: ele ainda não existia e foi criado pelo gerador.
- A declaração mínima de `node:fs` dos testes passou a expor leitura binária e tamanho de arquivo,
  necessários para o guard sem levar os tipos completos de Node para o app do navegador.

### Validação humana restante

- Confirmar o favicon na moldura real do Chrome e do Edge, nos temas claro e escuro do navegador.
- Confirmar a renderização do logo no README depois que a mudança estiver publicada no GitHub.
