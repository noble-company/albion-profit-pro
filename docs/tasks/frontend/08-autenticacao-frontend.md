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
