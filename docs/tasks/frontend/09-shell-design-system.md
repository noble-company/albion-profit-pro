# 09 — Shell da aplicação e design system

## Objetivo
Criar navegação responsiva, componentes de estado, tema e formatação segura.

## Por que
As telas seguintes precisam de uma linguagem visual comum e estados acessíveis antes de acumular
UI duplicada. Além disso, `server` (`west`/`east`/`europe`) virou obrigatório em `/items/{id}/prices`,
`/items/{id}/demand` e nos futuros `/craft/*` (estabilização task 03) e não existe default por
usuário em lugar nenhum do backend — sem um estado global aqui, cada tela teria que inventar o
próprio seletor.

## O que implementar
- Rotas `/login`, `/registro`, `/`, `/item/:uniqueName`, `/calculadora` e `/tokens`, com lazy load e
  error boundaries.
- Seletor de servidor (`west`/`east`/`europe`) no `AppShell`, com estado global (contexto/store) e
  persistência em `localStorage`. Sem escolha prévia, forçar a seleção antes de liberar as telas que
  dependem de mercado (12-15); busca de item e receita (11) não precisam dele. Todo hook que chama
  `/items/{id}/prices`, `/items/{id}/demand` ou `/craft/*` lê esse estado, não recebe `server` como
  prop redigitada tela a tela.
- AppShell responsivo, navegação por teclado, skip link, foco visível, labels e componentes shadcn
  mínimos. Criar `EstadoVazio`, `EstadoErro`, `Carregando` e toasts acessíveis.
- Tema claro/escuro/sistema persistido sem flash evitável.
- `formatarSilver` trabalha diretamente sobre string decimal (ou biblioteca decimal), sem converter
  para `number`; `formatarIdade` trata `null`, futuro/clock skew e alerta após janela configurada;
  `formatarPct` em pt-BR.
- Não transformar limiar de 6 h numa constante duplicada invisível: centralizar configuração da UI
  e manter alinhada ao backend.

## Bibliotecas/dependências
React Router 8, shadcn/ui e, se necessário, biblioteca decimal pequena e mantida.

## Depende de
Task 08.

## Testes manuais
Navegar desktop/mobile, teclado, tema e zoom de 200%.

## Testes automatizados
Rotas públicas/protegidas, formatadores sem perda em número grande, idade nula/velha, smoke de
acessibilidade dos componentes centrais, seletor de servidor persistindo em `localStorage` e
bloqueando navegação às telas de mercado sem escolha prévia.
