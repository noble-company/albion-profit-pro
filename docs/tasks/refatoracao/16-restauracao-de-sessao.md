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

---

## Estado da implementação

**Concluída.** `npm run typecheck` limpo · `npm run lint` 0 erros (4 warnings pré-existentes) ·
`npm run test` 87/87 em 17 arquivos · `npm run build` passa.

### O que entrou

- **`src/api/session.ts`** — elimina a duplicidade de estado (item 1, "solução melhor" da
  spec): não há mais variável de módulo `accessToken`. `getAccessToken()`/`setAccessToken()`
  leem e escrevem o `sessionStorage` **direto** — ele é a fonte de verdade única, com try/catch
  pra degradar gracioso se o storage estiver indisponível. Isso conserta o F5 (o token
  restaurado agora chega ao interceptor) **e** o vazamento entre testes (item 5: não sobra
  estado pra vazar). `ACCESS_TOKEN_STORAGE_KEY` mudou de `auth/service.ts` pra cá.
- **`src/auth/service.ts`** — `readStoredToken`/`writeStoredToken`/`clearStoredToken` removidas
  (eram wrappers redundantes). `logoutUser()` chama só `setAccessToken(null)`.
- **`src/auth/AuthContext.tsx`** — usa `getAccessToken`/`setAccessToken` de `@/api/session`.
  O estado inicial `'loading'` (item 2) já estava correto — a janela entre o mount e a resposta
  de `/auth/me` continua coberta por `RequireAuth` (que não redireciona enquanto `status ===
  'loading'`); só faltava o token de verdade chegar no header.
- **`src/test/msw/auth.ts`** (novo) — helper `requireBearer(request)`: devolve 401 se o header
  `Authorization: Bearer <token>` estiver ausente/malformado.
- **`src/test/msw/handlers.ts`** — auditoria dos handlers globais (item 4): `/items/categories`
  e `/locations` (pedidos de fundo por `useCategories`/`useLocations`) ganham default benigno
  **guardado por `requireBearer`**. `/health` continua livre.
- **`src/auth/auth.test.tsx`** —
  - `'restaura uma sessão válida armazenada na aba'`: o handler de `/auth/me` passa a checar o
    header e o teste **afirma** `authHeader === 'Bearer jwt-valido'`. É o teste que mentia; agora
    detecta o bug.
  - novo `'o token vive só no sessionStorage — sem cache de módulo que vaze entre testes'` —
    `setAccessToken('jwt-a')` → `sessionStorage.clear()` → `getAccessToken()` já devolve `null`.
  - o teste de logout troca `writeStoredToken` (removida) por `setAccessToken` de `@/api/session`.
- **`src/test/setup.ts`** — `sessionStorage.clear()` no `afterEach` global (item 5, defesa a
  mais junto do `queryClient.clear()` que a task 15 já pôs).

### Vermelho → verde (item 1 dos testes automatizados)

Antes de aplicar o fix, rodei `src/auth/auth.test.tsx` com o handler já checando o header:
`'restaura uma sessão válida armazenada na aba'` **falhou** com
`expected 'Bearer jwt-login' to be 'Bearer jwt-valido'` — mostrando os **dois** bugs de uma vez:
o token do `sessionStorage` (`jwt-valido`) nunca chegava à memória, e um resíduo de `jwt-login`
de um teste anterior estava vazando pela variável de módulo. Depois do fix: verde.

### Decisão consciente — `sessionStorage` × `localStorage` (item 6)

**Mantido `sessionStorage`**, confirmando a decisão de `S03` (task 06): o JWT fica em
`sessionStorage` até o cookie `httpOnly` do pré-lançamento. Abrir o produto numa aba nova
exigir login de novo é o custo aceito dessa margem de segurança (um XSS não persiste a sessão
entre sessões do navegador). Sem mudança de código.

### Desvios da spec

- **Item 4 lido de forma estrita.** "Auditar os demais handlers de `src/test/msw/`" — auditei
  só `test/msw/handlers.ts` (os handlers *globais* do diretório). **Não** adicionei checagem de
  `Authorization` em cada `server.use()` espalhado pelos outros arquivos de teste (oportunidades,
  preços, itens, craft, tokens): são dezenas de mocks que testam lógica de negócio assumindo
  "autenticado" implicitamente, não o fluxo de sessão — exigir header ali é outra task e
  arriscaria quebrar testes sem relação com este bug.
- **Bullet 1 dos testes automatizados** não virou um teste novo dedicado — o teste que já
  existia (`'restaura uma sessão válida armazenada na aba'`), agora com a checagem de header,
  **é** o teste vermelho→verde que o bullet pede. Um teste à parte só pra isso seria redundante.

### Testes automatizados

- `npm run typecheck` — limpo.
- `npm run lint` — 0 erros, 4 warnings pré-existentes.
- `npm run test` — **87/87 em 17 arquivos** (86 anteriores + 1 novo). Nenhuma regressão.
- `npm run build` — passa.

### Testes manuais que já rodei

Nenhum — os dois itens da seção "Testes manuais" exigem logar num backend rodando e apertar F5
no navegador. O comportamento central (o token restaurado chega ao header `Authorization`) já
está coberto por asserção de teste, não por inspeção.

### Pendente pra você testar

1. Subir o backend (`docker compose up -d` + `uv run uvicorn ...`), logar no frontend
   (`npm run dev`), e apertar **F5 em cada rota autenticada** (`/`, `/refino`, `/craft`,
   `/item`, `/calculadora`, `/tokens`) — a sessão tem que sobreviver, sem cair na tela de
   login.
2. Invalidar o token no backend (revogar/expirar) e recarregar — tem que cair na tela de
   login com "Sua sessão expirou".
3. Abrir o produto numa **aba nova** (mesma janela) — decisão conhecida: exige login de novo
   (`sessionStorage` é por aba). Confirmar que é isso mesmo que acontece, não um erro.
