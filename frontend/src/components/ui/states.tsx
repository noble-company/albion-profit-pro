import type { ReactNode } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function Carregando({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

export function EstadoVazio({
  title = 'Nenhum resultado',
  children,
  icon,
}: {
  title?: string
  children?: ReactNode
  icon?: ReactNode
}) {
  return (
    <Card className="border-dashed text-center">
      <CardContent className="flex flex-col items-center gap-2 py-10">
        <span className="text-muted-foreground" aria-hidden="true">
          {icon ?? <Inbox className="size-6" />}
        </span>
        <CardTitle className="text-base">{title}</CardTitle>
        {children && (
          <p className="max-w-md text-sm text-muted-foreground">{children}</p>
        )}
      </CardContent>
    </Card>
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
    <Card role="alert" className="border-destructive/40 bg-destructive/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      {onRetry && (
        <CardContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Tentar novamente
          </Button>
        </CardContent>
      )}
    </Card>
  )
}
