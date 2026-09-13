# 03 — ErrorBoundary de verdade

> Corrige `E04`.

## Objetivo

Garantir que uma exceção durante o render vire estado de erro recuperável na tela, e não página
em branco.

## Por que

Grep por `ErrorBoundary`, `componentDidCatch` e `getDerivedStateFromError` em `frontend/src/` e
`frontend/e2e/`: **zero ocorrências**. O componente chamado `Boundary` (`src/App.tsx:44-52`) é só
um `Suspense`:

```tsx
function Boundary({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Carregando label="Carregando a tela…" />}>
      {children}
    </Suspense>
  )
}
```

`Suspense` trata promessa pendente, não exceção. Sem `ErrorBoundary`, qualquer throw no render
desmonta a árvore inteira e o usuário fica com tela branca — sem mensagem, sem caminho de volta.

Três origens conhecidas hoje:

1. `E02`/`E03` — entrada de filtro chegando ao `money()` (task 02 fecha a origem, mas não a
   consequência de qualquer outra).
2. **Falha de carregamento de chunk lazy.** Com o code splitting real da task 3.5/25, um deploy
   novo invalida os hashes; um usuário com a aba aberta que navegue para uma rota ainda não
   carregada recebe rejeição de `import()`. Isso não é hipótese remota, é o comportamento normal
   de SPA versionada.
3. Qualquer defeito futuro de render numa das seis telas.

O produto já tem o vocabulário certo pra isso: `EstadoErro` (`src/components/ui/states.tsx:51`)
com `role="alert"`, definido na linguagem visual (`docs/13-linguagem-visual.md`).

## O que implementar

1. Um `ErrorBoundary` de classe em `src/components/`, com `getDerivedStateFromError` +
   `componentDidCatch`, renderizando `EstadoErro` com ação de recuperação.
2. Envolver o `Boundary` de `App.tsx:44-52` — assim cada rota tem `ErrorBoundary` por fora e
   `Suspense` por dentro, e o erro de uma tela não derruba o `AppShell`.
3. Tratamento específico para falha de carregamento de chunk: a ação oferecida deve ser recarregar
   a página (o bundle mudou), não "tentar de novo" — que falharia de novo contra o mesmo hash.
4. Resetar o estado de erro na mudança de rota, para o usuário conseguir sair da tela quebrada
   navegando.
5. Decidir se o erro capturado é reportado em algum lugar (hoje não há telemetria); se não for,
   registrar a decisão — sem `console.*`, que o projeto não usa em produção.

## Depende de

Nada. Pode ser feita em paralelo com a 01 e a 02, e **deve** entrar mesmo que elas fechem as
origens conhecidas — é a rede, não o remendo.

## Testes automatizados

- Um componente que lança no render, montado dentro do `Boundary`, produz `EstadoErro` e não
  propaga a exceção.
- O `AppShell` continua montado quando a rota interna quebra.
- Erro cuja mensagem indica falha de carregamento de chunk oferece recarregar, não repetir.
- Mudar de rota depois do erro limpa o estado e renderiza a tela nova.

## Testes manuais

Com a task 02 revertida localmente, digitar `1,5` em "Estação por execução" e confirmar que
aparece o estado de erro, não tela branca.
