import { useState } from 'react'
import { ApiError } from '@/api'
import { EstadoErro, EstadoVazio, Carregando } from '@/components/ui/states'
import { useToast } from '@/components/ui/ToastProvider'
import { useCreateToken, useRevokeToken, useTokens } from './hooks'
import type { TokenCreated } from './service'

function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Nunca'
}
export function ConfigInstrucoes() {
  return (
    <aside className="mt-8 rounded-xl border border-amber-400/30 bg-amber-400/10 p-5">
      <h2 className="font-semibold text-amber-200">Configurar o client Go</h2>
      <p className="mt-2 text-sm text-stone-300">
        Cole o segredo uma única vez no arquivo <code>config.yaml</code> ou use
        a flag <code>-token</code>. Não compartilhe este valor.
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-stone-950 p-3 text-xs text-stone-200">{`token: apk_...\n# ou: albiondata-client -token apk_...`}</pre>
      <p className="mt-3 text-sm text-stone-300">
        Depois de configurar, atravesse uma zona no jogo para o client iniciar a
        coleta. O último uso é aproximado (atualizado no máximo uma vez por
        hora).
      </p>
    </aside>
  )
}
function CreatedModal({
  token,
  onClose,
}: {
  token: TokenCreated
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token.token)
      setCopied(true)
    } catch {
      const area = document.createElement('textarea')
      area.value = token.token
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.append(area)
      area.select()
      document.execCommand('copy')
      area.remove()
      setCopied(true)
    }
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-created"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
    >
      <div className="w-full max-w-xl rounded-2xl border border-amber-400/40 bg-stone-900 p-6">
        <h2 id="token-created" className="text-xl font-bold">
          Token criado — copie agora
        </h2>
        <p className="mt-2 text-sm text-amber-200">
          Este segredo não será mostrado novamente.
        </p>
        <code className="mt-4 block break-all rounded bg-stone-950 p-4 text-sm">
          {token.token}
        </code>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            className="rounded border border-stone-600 px-4 py-2"
            onClick={() => void copy()}
          >
            {copied ? 'Copiado' : 'Copiar segredo'}
          </button>
          <button
            className="rounded bg-amber-400 px-4 py-2 font-semibold text-stone-950 disabled:opacity-50"
            disabled={!copied}
            onClick={onClose}
          >
            Copiei e fechar
          </button>
        </div>
      </div>
    </div>
  )
}
export function TokensPage() {
  const query = useTokens()
  const create = useCreateToken()
  const revoke = useRevokeToken()
  const { toast } = useToast()
  const [created, setCreated] = useState<TokenCreated | null>(null)
  if (query.isLoading) return <Carregando label="Carregando tokens…" />
  if (query.isError)
    return (
      <EstadoErro
        title="Não foi possível carregar seus tokens"
        onRetry={() => void query.refetch()}
      />
    )
  const active = query.data?.filter((token) => !token.revoked_at) ?? []
  const generate = async () => {
    try {
      setCreated(await create.mutateAsync())
    } catch (error) {
      const detail =
        error instanceof ApiError && typeof error.detail === 'string'
          ? error.detail
          : 'Não foi possível criar o token.'
      toast(detail)
    }
  }
  const revokeOne = async (id: string) => {
    try {
      await revoke.mutateAsync(id)
      toast('Token revogado.')
    } catch {
      toast('Não foi possível revogar o token.')
    }
  }
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-amber-400">
            Client Go
          </p>
          <h1 className="mt-2 text-3xl font-bold">Tokens de API</h1>
          <p className="mt-2 text-stone-400">
            Gerencie as credenciais usadas pelo coletor AlbionData.
          </p>
        </div>
        <button
          className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-stone-950"
          onClick={() => void generate()}
          disabled={create.isPending}
        >
          {create.isPending ? 'Gerando…' : 'Gerar token'}
        </button>
      </div>
      {active.length === 0 ? (
        <div className="mt-8">
          <EstadoVazio title="Nenhum token ativo">
            Gere um token para configurar o client Go.
          </EstadoVazio>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {active.map((token) => (
            <li
              key={token.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-800 bg-stone-900 p-4"
            >
              <div>
                <p className="font-medium">
                  Token <code>…{token.token_sufixo}</code>
                </p>
                <p className="text-sm text-stone-400">
                  Criado em {date(token.created_at)} · Último uso:{' '}
                  {date(token.ultimo_uso_em)}
                </p>
              </div>
              <button
                className="rounded border border-red-400/50 px-3 py-2 text-sm text-red-200"
                onClick={() => void revokeOne(token.id)}
                disabled={revoke.isPending}
              >
                Revogar
              </button>
            </li>
          ))}
        </ul>
      )}
      {created && (
        <CreatedModal token={created} onClose={() => setCreated(null)} />
      )}
      <ConfigInstrucoes />
    </section>
  )
}
