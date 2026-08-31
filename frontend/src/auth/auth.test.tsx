import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/App'
import { renderWithProviders } from '@/test/render'
import { server } from '@/test/msw/server'

const user = {
  id: '0f7f6f9d-4a8a-4e98-9a3b-8d5a7c2c1f11',
  email: 'jogador@example.com',
  is_active: true,
  is_superuser: false,
  is_verified: false,
}

beforeEach(() => {
  sessionStorage.clear()
})

test('protege a home e redireciona para login', async () => {
  renderWithProviders(<App />)
  expect(
    await screen.findByRole('heading', { name: 'Entrar' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Criar conta' })).toBeInTheDocument()
})

test('faz login com form-urlencoded, grava sessão e acessa o destino', async () => {
  const typed = userEvent.setup()
  let encodedBody = ''
  server.use(
    http.post('http://localhost:8000/auth/login', async ({ request }) => {
      expect(request.headers.get('content-type')).toContain(
        'application/x-www-form-urlencoded',
      )
      encodedBody = await request.text()
      return HttpResponse.json({
        access_token: 'jwt-login',
        token_type: 'bearer',
      })
    }),
    http.get('http://localhost:8000/auth/me', () => HttpResponse.json(user)),
  )

  renderWithProviders(<App />)
  await typed.type(screen.getByLabelText('E-mail'), user.email)
  await typed.type(screen.getByLabelText('Senha'), 'senha-segura-123')
  await typed.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(
    await screen.findByRole('heading', { name: 'Escolha um servidor' }),
  ).toBeInTheDocument()
  expect(new URLSearchParams(encodedBody).get('username')).toBe(user.email)
  expect(new URLSearchParams(encodedBody).get('password')).toBe(
    'senha-segura-123',
  )
  expect(sessionStorage.getItem('albion-profit-pro.access-token')).toBe(
    'jwt-login',
  )
})

test('valida senha localmente sem enviar o e-mail inteiro', async () => {
  const typed = userEvent.setup()
  let requests = 0
  server.use(
    http.post('http://localhost:8000/auth/register', () => {
      requests += 1
      return HttpResponse.json(user, { status: 201 })
    }),
  )
  renderWithProviders(<App />)
  await typed.click(await screen.findByRole('link', { name: 'Criar conta' }))
  await typed.type(screen.getByLabelText('E-mail'), user.email)
  await typed.type(screen.getByLabelText('Senha'), `${user.email}123`)
  await typed.type(screen.getByLabelText('Confirmar senha'), `${user.email}123`)
  await typed.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(
    await screen.findByText('A senha não pode conter o e-mail inteiro.'),
  ).toBeInTheDocument()
  expect(requests).toBe(0)
})

test('mapeia usuário existente e valida a confirmação de senha', async () => {
  const typed = userEvent.setup()
  server.use(
    http.post('http://localhost:8000/auth/register', () =>
      HttpResponse.json(
        { detail: 'REGISTER_USER_ALREADY_EXISTS' },
        { status: 400 },
      ),
    ),
  )
  renderWithProviders(<App />)
  await typed.click(await screen.findByRole('link', { name: 'Criar conta' }))
  await typed.type(screen.getByLabelText('E-mail'), user.email)
  await typed.type(screen.getByLabelText('Senha'), 'senha-segura-123')
  await typed.type(screen.getByLabelText('Confirmar senha'), 'senha-diferente')
  await typed.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(
    await screen.findByText('As senhas precisam ser iguais.'),
  ).toBeInTheDocument()
  const confirmation = screen.getByLabelText(/Confirmar senha/)
  await typed.clear(confirmation)
  await typed.type(confirmation, 'senha-segura-123')
  await typed.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(
    await screen.findByText('Este e-mail já está cadastrado.'),
  ).toBeInTheDocument()
})

test('exibe rate limit do backend no login', async () => {
  const typed = userEvent.setup()
  server.use(
    http.post('http://localhost:8000/auth/login', () =>
      HttpResponse.json({ detail: 'muitas tentativas' }, { status: 429 }),
    ),
  )
  renderWithProviders(<App />)
  await typed.type(await screen.findByLabelText('E-mail'), user.email)
  await typed.type(screen.getByLabelText('Senha'), 'senha-segura-123')
  await typed.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(
    await screen.findByText(
      'Muitas tentativas. Aguarde um minuto e tente novamente.',
    ),
  ).toBeInTheDocument()
})

test('restaura uma sessão válida armazenada na aba', async () => {
  sessionStorage.setItem('albion-profit-pro.access-token', 'jwt-valido')
  server.use(
    http.get('http://localhost:8000/auth/me', () => HttpResponse.json(user)),
  )
  renderWithProviders(<App />)
  expect(
    await screen.findByRole('heading', { name: 'Escolha um servidor' }),
  ).toBeInTheDocument()
})

test('restaura sessão da aba e mostra expiração após 401', async () => {
  sessionStorage.setItem('albion-profit-pro.access-token', 'jwt-expirado')
  server.use(
    http.get(
      'http://localhost:8000/auth/me',
      () => new HttpResponse(null, { status: 401 }),
    ),
  )
  renderWithProviders(<App />)
  expect(
    await screen.findByRole('heading', { name: 'Entrar' }),
  ).toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Sua sessão expirou',
  )
})

test('logout sempre limpa a sessão mesmo se a API falhar', async () => {
  const { logoutUser, writeStoredToken } = await import('./service')
  writeStoredToken('jwt-logout')
  server.use(
    http.post('http://localhost:8000/auth/logout', () =>
      HttpResponse.json({ detail: 'indisponível' }, { status: 503 }),
    ),
  )
  await expect(logoutUser()).rejects.toMatchObject({ status: 503 })
  await waitFor(() =>
    expect(sessionStorage.getItem('albion-profit-pro.access-token')).toBeNull(),
  )
})
