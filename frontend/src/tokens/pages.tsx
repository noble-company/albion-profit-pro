import { useState } from 'react'

import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/ui/states'
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
    <aside className="mt-8 rounded-xl border border-primary/30 bg-primary/10 p-5">
      <h2 className="font-semibold text-primary">Configurar o client Go</h2>
      <p className="mt-2 text-sm text-foreground">
        Cole o segredo uma única vez no arquivo <code>config.yaml</code> ou use
        a flag <code>-token</code>. Não compartilhe este valor.
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-background p-3 text-xs text-foreground">{`token: apk_...\n# ou: albiondata-client -token apk_...`}</pre>
      <p className="mt-3 text-sm text-foreground">
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
    <Dialog
      open
      onOpenChange={(next) => {
        // Só deixa fechar depois de copiar — o segredo não volta a aparecer.
        if (!next && copied) onClose()
      }}
    >
      <DialogContent
        className="max-w-xl border-primary/40"
        onEscapeKeyDown={(event) => {
          if (!copied) event.preventDefault()
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Token criado — copie agora</DialogTitle>
          <DialogDescription className="text-primary">
            Este segredo não será mostrado novamente.
          </DialogDescription>
        </DialogHeader>
        <code className="block break-all rounded bg-background p-4 text-sm">
          {token.token}
        </code>
        <DialogFooter>
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? 'Copiado' : 'Copiar segredo'}
          </Button>
          <Button disabled={!copied} onClick={onClose}>
            Copiei e fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <p className="text-sm uppercase tracking-widest text-primary">
            Client Go
          </p>
          <h1 className="mt-2 text-3xl font-bold">Tokens de API</h1>
          <p className="mt-2 text-foreground-muted">
            Gerencie as credenciais usadas pelo coletor AlbionData.
          </p>
        </div>
        <Button onClick={() => void generate()} disabled={create.isPending}>
          {create.isPending ? 'Gerando…' : 'Gerar token'}
        </Button>
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
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4"
            >
              <div>
                <p className="font-medium">
                  Token <code>…{token.token_sufixo}</code>
                </p>
                <p className="text-sm text-foreground-muted">
                  Criado em {date(token.created_at)} · Último uso:{' '}
                  {date(token.ultimo_uso_em)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-danger/50 text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => void revokeOne(token.id)}
                disabled={revoke.isPending}
              >
                Revogar
              </Button>
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
