# 16 — Restauração de sessão

> Corrige `F07`. Inclui a correção do teste que esconde o bug.

## Objetivo

Fazer com que recarregar a página não deslogue o usuário — e fazer o teste correspondente
detectar o problema em vez de escondê-lo.

## Por que

O token vive em duas camadas que não conversam na hora de restaurar:

- `src/api/session.ts` guarda o token numa **variável de módulo**, e o interceptor de request de
  `api/client.ts` lê dela via `getAccessToken()`.
- `writeStoredToken()` grava no `sessionStorage` **e** chama `setAccessToken()`.
- `readStoredToken()` **apenas lê o `sessionStorage`** e nunca chama `setAccessToken()`.
- `AuthContext` no mount faz `readStoredToken()` e, se achou algo, chama `fetchCurrentUser()`.

Depois de um F5, a variável de módulo está `null`. `GET /auth/me` sai **sem o header
`Authorization`**, o backend responde 401, o interceptor dispara `notifyUnauthorized()` e o app
cai em `clearSession(true)` — tela de login com "Sua sessão expirou".

E existe um teste chamado `restaura uma sessão válida armazenada na aba` que **passa**. Ele passa
porque o handler MSW responde `HttpResponse.json(user)` incondicionalmente, sem olhar o header.
O teste verifica que a tela certa aparece, não que a autenticação aconteceu. Um teste verde
escondendo um bug de produção é mais perigoso que a ausência do teste.

## O que implementar

1. Restaurar o token na memória do módulo antes de qualquer requisição autenticada — a correção
   mínima é `readStoredToken()` chamar `setAccessToken()`, mas a solução melhor é eliminar a
   duplicidade de estado: uma função só que é a fonte de verdade do token, com o
   `sessionStorage` como persistência dela.
2. Garantir que o estado inicial `'loading'` cubra a janela entre o mount e a resposta de
   `/auth/me`, sem redirecionar para login no meio.
3. **Corrigir os handlers MSW** para exigir `Authorization: Bearer <token>` em todas as rotas
   autenticadas, devolvendo 401 quando ausente. Isso é o que faz a suíte parar de mentir.
4. Auditar os demais handlers de `src/test/msw/` pelo mesmo problema.
5. Isolar o estado entre testes: `accessToken` é módulo global e o `queryClient` é singleton
   compartilhado em `src/test/render.tsx` — há vazamento entre casos de teste.
6. Reavaliar `sessionStorage` x `localStorage`: hoje abrir o produto numa aba nova exige login de
   novo. Decidir conscientemente, em conjunto com `S03` (task 06).

## Depende de

Task 01. Recomendado fazer junto da task 15.

## Testes automatizados

- Teste que **falha** se `/auth/me` for chamado sem `Authorization` — deve ser escrito antes da
  correção e confirmado vermelho.
- Restaurar sessão a partir do `sessionStorage` mantém o usuário autenticado.
- Token inválido continua levando à tela de login com o aviso de expiração.
- Nenhum estado de sessão vaza entre testes (dois casos consecutivos independentes).

## Testes manuais

Logar, apertar F5 em cada rota autenticada e confirmar que a sessão sobrevive. Depois, invalidar
o token no backend e confirmar que a expiração continua sendo tratada.
