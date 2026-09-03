/**
 * Página de demonstração dos primitivos shadcn/ui — rota `/ui`. Temporária (task 3.5/11): serve
 * pra revisar foco, teclado e estados nos dois temas. Pode ser removida quando as telas do
 * bloco 4 estiverem prontas.
 */
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/ToastProvider'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

export function UiPreview() {
  const { toast } = useToast()
  const [checked, setChecked] = useState(true)
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Componentes base</h1>
        <p className="text-sm text-muted-foreground">
          Rota temporária (task 11). Teste foco, teclado e os dois temas.
        </p>
      </div>

      <Section title="Button">
        <Button>Padrão</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
        <Button size="sm">Pequeno</Button>
        <Button disabled>Desativado</Button>
      </Section>

      <Section title="Badge">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
      </Section>

      <Section title="Input / Label / Checkbox / Switch">
        <div className="grid w-64 gap-1.5">
          <Label htmlFor="demo-input">E-mail</Label>
          <Input id="demo-input" type="email" placeholder="voce@exemplo.com" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
          />
          Cobertura completa
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch defaultChecked />
          Premium
        </label>
      </Section>

      <Section title="Select">
        <Select>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="profit_desc">Lucro (maior primeiro)</SelectItem>
            <SelectItem value="roi_desc">ROI (maior primeiro)</SelectItem>
            <SelectItem value="freshness">Observação mais recente</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section title="Dropdown / Dialog / Sheet / Tooltip">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Servidor</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>West</DropdownMenuItem>
            <DropdownMenuItem>East</DropdownMenuItem>
            <DropdownMenuItem>Europa</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog>
          <DialogTrigger asChild>
            <Button>Abrir diálogo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Análise detalhada</DialogTitle>
              <DialogDescription>
                O cálculo exato roda no servidor por profundidade de livro.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Abrir painel</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
              <SheetDescription>Recorte o mercado.</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost">Passe o mouse</Button>
          </TooltipTrigger>
          <TooltipContent>Estimativa — abra a análise para o exato.</TooltipContent>
        </Tooltip>

        <Button variant="secondary" onClick={() => toast('Token revogado.')}>
          Disparar toast
        </Button>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Lucro</TableHead>
              <TableHead>ROI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>T4 Bar</TableCell>
              <TableCell>1.234</TableCell>
              <TableCell>18%</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>T5 Plank</TableCell>
              <TableCell>987</TableCell>
              <TableCell>12%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Separator />

      <Section title="Estados">
        <div className="w-full space-y-4">
          <Carregando />
          <EstadoVazio title="Nenhuma oportunidade">
            A ausência de dados não representa lucro zero.
          </EstadoVazio>
          <EstadoErro title="Não foi possível carregar" onRetry={() => {}} />
        </div>
      </Section>

      <Card>
        <CardHeader>
          <CardTitle>Card</CardTitle>
          <CardDescription>Com header, descrição e conteúdo.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Corpo do card.
        </CardContent>
      </Card>
    </div>
  )
}
