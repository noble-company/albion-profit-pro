export function Carregando({ label = 'Carregando…' }: { label?: string }) {
  return (
    <p
      role="status"
      className="rounded-xl border border-stone-700 p-6 text-stone-400"
    >
      {label}
    </p>
  )
}
import type { ReactNode } from 'react'
export function EstadoVazio({
  title = 'Nenhum resultado',
  children,
}: {
  title?: string
  children?: ReactNode
}) {
  return (
    <section className="rounded-xl border border-dashed border-stone-700 p-8 text-center">
      <h2 className="font-semibold">{title}</h2>
      {children && <p className="mt-2 text-stone-400">{children}</p>}
    </section>
  )
}
export function EstadoErro({
  title = 'Não foi possível carregar',
  onRetry,
}: {
  title?: string
  onRetry?: () => void
}) {
  return (
    <section
      role="alert"
      className="rounded-xl border border-red-400/40 bg-red-400/10 p-6"
    >
      <h2 className="font-semibold text-red-200">{title}</h2>
      {onRetry && (
        <button className="mt-3 underline" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </section>
  )
}
