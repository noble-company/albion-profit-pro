# 04 — Erros de formulário na Calculadora

> Corrige `E05`.

## Objetivo

Fazer o formulário da Calculadora dizer por que não submeteu, em vez de não reagir.

## Por que

`frontend/src/craft/pages.tsx:148` desestrutura `formState: { errors }` do `react-hook-form` e o
usa **uma única vez**, em `:209`, para o campo de item:

```tsx
error={errors.output_item?.message}
```

As outras regras existem, bloqueiam o submit e não renderizam nada:

- `:225` — `min: { value: 1, message: 'Mínimo 1' }` no campo Quantidade
- `:231` — `required: 'Selecione a cidade'` no campo Cidade

O `select` de cidade nasce em `<option value="">Selecionar</option>`. Ou seja: o usuário abre a
Calculadora, escolhe o item, aperta o botão e **nada acontece** — sem mensagem, sem foco no campo
que faltou, sem pista. É a tela que dá nome ao produto.

Além do prejuízo óbvio de uso, é falha de acessibilidade: sem `aria-invalid` e sem
`aria-describedby`, um leitor de tela também não tem como saber o que impediu o envio.

Há um agravante de fundo: os campos de `:216-286` são marcação manual com classes repetidas à
mão (`'mt-1 w-full rounded border border-border-strong bg-background px-3 py-2'`, seis vezes),
enquanto `src/components/ui/input.tsx` e `src/components/ui/label.tsx` existem, foram instalados
pela task 3.5/11 e estão órfãos. Os componentes da lib já trazem `focus-visible:ring`
(`ui/input.tsx:11`), que os campos escritos à mão não têm.

## O que implementar

1. Renderizar a mensagem de erro de **todos** os campos validados, no mesmo padrão visual que o
   `ItemAutocomplete` já usa para `output_item`.
2. `aria-invalid` no campo e `aria-describedby` apontando para o elemento da mensagem.
3. Mover o foco para o primeiro campo inválido no submit — o `react-hook-form` faz isso com
   `shouldFocusError`, que é o default; confirmar que não está desligado e que funciona com os
   campos manuais.
4. Substituir os campos manuais por `ui/input.tsx`, `ui/label.tsx` e `ui/select` onde couber,
   ligando `id` e `htmlFor`. Resolve de uma vez o foco visível ausente e tira componentes da lista
   de órfãos (`P09`).
5. Revisar as demais telas com formulário (`items/pages.tsx:102-108`, `auth/pages.tsx`) para o
   mesmo padrão de rotulagem explícita.

## Depende de

Nada.

## Testes automatizados

- Submeter sem cidade renderiza "Selecione a cidade", marca o campo com `aria-invalid` e não
  chama a API.
- Quantidade `0` renderiza "Mínimo 1".
- O campo inválido recebe foco após o submit.
- `jest-axe` na Calculadora **com o formulário em estado de erro** não acusa violação — hoje o
  `a11y.test.tsx` só vê a tela vazia (ver task 07).

## Testes manuais

Abrir `/calculadora`, escolher um item, deixar a cidade em "Selecionar" e apertar o botão:
a mensagem tem que aparecer e o foco ir para o campo.
