# 11 — shadcn/ui de verdade

> Corrige `F01`. É a primeira das quatro tasks que respondem à queixa "o frontend está feio".

## Objetivo

Instalar de fato a biblioteca de componentes que foi decidida na task 3/09 e nunca chegou ao
projeto, para que as telas parem de reinventar controles a cada arquivo.

## Por que

`frontend/components.json` existe e está configurado: shadcn/ui, estilo `new-york`, base
`neutral`, `iconLibrary: "lucide"`, aliases apontando para `@/components/ui`. Só que o
`package.json` **não tem nenhum `@radix-ui/*`, não tem `class-variance-authority` e não tem
`lucide-react`**. A pasta `src/components/ui/` contém apenas `.gitkeep`, `states.tsx` e
`ToastProvider.tsx` — nenhum componente shadcn foi gerado.

O resultado é direto: não existe `Button`, `Card`, `Table`, `Input`, `Select`, `Checkbox`,
`Dialog`, `Badge`, `Tooltip` ou `Skeleton` no produto. Cada tela monta tudo com utilitários
Tailwind soltos, e **não há um único ícone**: a interface usa `☰` para o menu, `×` para fechar,
`⇄` e `↗` como ilustração de estado vazio. É essa ausência — não o framework — que faz o produto
parecer amador.

## O que implementar

1. Instalar as dependências reais: `class-variance-authority`, `lucide-react` e os pacotes
   `@radix-ui/*` exigidos pelos componentes escolhidos. Fixar versões, como o resto do projeto.
2. Validar a compatibilidade com **Tailwind CSS 4** e **React 19** antes de fixar — o projeto
   usa Tailwind 4 com `@tailwindcss/vite`, e boa parte da documentação de shadcn ainda pressupõe
   Tailwind 3. Registrar o resultado dessa verificação na task, como foi feito com `W6`/`W7`.
3. Gerar o conjunto base em `src/components/ui/`: `button`, `card`, `table`, `input`, `select`,
   `checkbox`/`switch`, `dialog`/`sheet`, `badge`, `tooltip`, `skeleton`, `separator`,
   `dropdown-menu`, `toast` (ou `sonner`).
4. Reconciliar com o que já existe: `states.tsx` (`Carregando`, `EstadoVazio`, `EstadoErro`) e
   `ToastProvider.tsx` passam a ser construídos sobre os primitivos, não em paralelo a eles.
5. Adotar `lucide-react` e remover os caracteres usados como ícone. Confirmar que o ícone tem
   `aria-hidden` quando decorativo e rótulo acessível quando é o único conteúdo do botão.
6. **Não** reescrever telas nesta task. Aqui só entra a fundação; as telas vêm no bloco 4.

## Depende de

Task 01.

## Testes automatizados

- `npm run lint && npm run typecheck && npm run test` verdes após a instalação.
- Teste de fumaça renderizando cada componente base sem erro de console.
- Nenhum caractere usado como ícone (`☰`, `×`, `⇄`, `↗`) permanece em `src/` — verificação
  automatizada, para não voltar por descuido.
- `npm run build` continua passando e o tamanho do bundle é registrado, para comparação futura.

## Testes manuais

Abrir uma página de demonstração com todos os componentes nos dois temas e conferir foco,
teclado e estados (hover, disabled, erro).
