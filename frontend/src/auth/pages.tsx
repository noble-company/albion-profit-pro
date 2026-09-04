import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import type { ReactNode } from 'react'

import { useAuth } from './useAuth'
import {
  loginSchema,
  registrationSchema,
  type LoginValues,
  type RegistrationValues,
} from './forms'
import { authErrorMessage } from './messages'

function AuthCard({
  children,
  title,
  subtitle,
}: {
  children: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-primary/20 bg-surface p-8 shadow-2xl shadow-black/30">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-primary">
          Albion Profit Pro
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-foreground-muted">{subtitle}</p>
        <div className="mt-7">{children}</div>
      </section>
    </main>
  )
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1 text-sm text-danger">{message}</p>
  ) : null
}

export function LoginPage() {
  const { login, sessionExpired, clearSessionExpired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destinationParam = new URLSearchParams(location.search).get('next')
  const destination =
    destinationParam?.startsWith('/') && !destinationParam.startsWith('//')
      ? destinationParam
      : '/'
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })
  const submit = form.handleSubmit(async (values) => {
    try {
      await login(values)
      void navigate(destination, { replace: true })
    } catch (error) {
      form.setError('root', { message: authErrorMessage(error) })
    }
  })
  return (
    <AuthCard
      title="Entrar"
      subtitle="Acesse sua calculadora e seus dados coletados."
    >
      {sessionExpired && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary"
        >
          Sua sessão expirou. Entre novamente para continuar.{' '}
          <button className="ml-2 underline" onClick={clearSessionExpired}>
            Fechar
          </button>
        </div>
      )}
      {form.formState.errors.root?.message && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {form.formState.errors.root.message}
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          void submit(event)
        }}
        noValidate
      >
        <label className="block text-sm font-medium" htmlFor="login-email">
          E-mail
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2"
            {...form.register('email')}
          />
          <FieldError message={form.formState.errors.email?.message} />
        </label>
        <label className="block text-sm font-medium" htmlFor="login-password">
          Senha
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2"
            {...form.register('password')}
          />
          <FieldError message={form.formState.errors.password?.message} />
        </label>
        <button
          className="w-full rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary disabled:opacity-50"
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          {form.formState.isSubmitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-foreground-muted">
        Ainda não tem conta?{' '}
        <Link className="text-primary underline" to="/register">
          Criar conta
        </Link>
      </p>
    </AuthCard>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const form = useForm<RegistrationValues>({
    resolver: zodResolver(registrationSchema),
  })
  const submit = form.handleSubmit(async ({ email, password }) => {
    try {
      await register({ email, password })
      void navigate('/login', { replace: true, state: { registered: true } })
    } catch (error) {
      form.setError('root', { message: authErrorMessage(error) })
    }
  })
  return (
    <AuthCard
      title="Criar conta"
      subtitle="Use um e-mail e uma senha com pelo menos 10 caracteres."
    >
      {form.formState.errors.root?.message && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {form.formState.errors.root.message}
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          void submit(event)
        }}
        noValidate
      >
        <label className="block text-sm font-medium" htmlFor="register-email">
          E-mail
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2"
            {...form.register('email')}
          />
          <FieldError message={form.formState.errors.email?.message} />
        </label>
        <label
          className="block text-sm font-medium"
          htmlFor="register-password"
        >
          Senha
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2"
            {...form.register('password')}
          />
          <FieldError message={form.formState.errors.password?.message} />
        </label>
        <label
          className="block text-sm font-medium"
          htmlFor="register-confirmation"
        >
          Confirmar senha
          <input
            id="register-confirmation"
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-border-strong bg-background px-3 py-2"
            {...form.register('passwordConfirmation')}
          />
          <FieldError
            message={form.formState.errors.passwordConfirmation?.message}
          />
        </label>
        <button
          className="w-full rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary disabled:opacity-50"
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          {form.formState.isSubmitting ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-foreground-muted">
        Já tem conta?{' '}
        <Link className="text-primary underline" to="/login">
          Entrar
        </Link>
      </p>
    </AuthCard>
  )
}
