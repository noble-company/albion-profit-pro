# 09 — Shell da aplicação e design system

## Objetivo
Criar navegação responsiva, componentes de estado, tema e formatação segura.

## Por que
As telas seguintes precisam de uma linguagem visual comum e estados acessíveis antes de acumular
UI duplicada.

## O que implementar
- Rotas `/login`, `/registro`, `/`, `/item/:uniqueName`, `/calculadora` e `/tokens`, com lazy load e
  error boundaries.
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
Rotas públicas/protegidas, formatadores sem perda em número grande, idade nula/velha e smoke de
acessibilidade dos componentes centrais.
