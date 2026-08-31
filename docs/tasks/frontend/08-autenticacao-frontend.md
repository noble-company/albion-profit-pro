# 08 — Autenticação no frontend

## Objetivo
Entregar registro, login, logout, expiração e proteção de rotas.

## Por que
Fastapi-users usa form-urlencoded no login, JWT de 1 h sem refresh e validação de senha no backend.

## O que implementar
- `session.ts`, `AuthProvider`, `useAuth`, páginas de login/registro e `RequireAuth`.
- Login envia `username` e `password` como `application/x-www-form-urlencoded`; registro é JSON.
- RHF/Zod espelha mínimo de 10 caracteres e bloqueio do e-mail inteiro na senha. Backend continua
  sendo autoridade; mapear `REGISTER_INVALID_PASSWORD` e `REGISTER_USER_ALREADY_EXISTS`.
- Guardar JWT em memória + `sessionStorage`; documentar risco XSS e ausência de refresh/cookie
  httpOnly. Não logar nem inserir token em URL.
- Logout chama `/auth/logout` por higiene e sempre limpa localmente. 401 redireciona com motivo de
  sessão expirada e preserva destino seguro para retorno.
- Não oferecer reset de senha, pois o router não existe.

## Bibliotecas/dependências
React Hook Form e Zod.

## Depende de
Task 07.

## Testes manuais
Registrar, sair, entrar, atualizar página e simular expiração curta.

## Testes automatizados
Encoding de login, regras locais, erros do backend, guarda de rota, persistência por aba, logout e
401/429 visíveis.

## Implementação concluída em 2026-08-23

- Criados `AuthProvider`, `useAuth` e `RequireAuth`. A sessão inicia em memória, é restaurada da
  `sessionStorage` por aba e é validada novamente em `GET /auth/me`.
- Login usa o contrato FastAPI Users em `application/x-www-form-urlencoded` (`username`,
  `password`, `scope` e `grant_type`); registro usa JSON; logout chama a API e limpa localmente
  mesmo quando a chamada falha.
- Páginas de login e registro foram adicionadas com React Hook Form + Zod. A validação local exige
  senha de 10 caracteres, confirmação idêntica e bloqueia o e-mail inteiro dentro da senha.
- Erros `REGISTER_INVALID_PASSWORD`, `REGISTER_USER_ALREADY_EXISTS`, `401` e `429` recebem
  mensagens de UI. O canal 401 da Task 07 redireciona para login uma vez por onda e preserva
  somente destinos internos seguros.
- O `AuthProvider` foi conectado ao provider de aplicação; a composição visual completa continua
  reservada à Task 09.
- Foram adicionados 8 testes de autenticação, além do smoke test do App e dos 4 testes da API da
  Task 07. A suíte frontend passou com 13 testes; typecheck, lint, Prettier e build também passaram.

## Segurança e limites conhecidos

- O JWT fica em memória e `sessionStorage`; isso permite persistência por aba, mas expõe o risco
  usual de XSS. O frontend não registra o token, não o coloca em URL e o backend continua sendo a
  autoridade de autenticação.
- Não há refresh token nem cookie `httpOnly` neste contrato; reset de senha permanece fora do
  escopo porque o backend não publica esse router.
