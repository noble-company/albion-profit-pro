import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/test/render'

import { Badge } from './badge'
import { Button } from './button'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Checkbox } from './checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { Input } from './input'
import { Label } from './label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'
import { Separator } from './separator'
import { Sheet, SheetContent, SheetTrigger } from './sheet'
import { Skeleton } from './skeleton'
import { Carregando, EstadoErro, EstadoVazio } from './states'
import { Switch } from './switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

function expectNoConsoleError(render: () => void) {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render()
    expect(spy).not.toHaveBeenCalled()
  } finally {
    spy.mockRestore()
  }
}

test('primitivos shadcn renderizam sem erro de console', () => {
  expectNoConsoleError(() =>
    renderWithProviders(
      <div>
        <Button>Ok</Button>
        <Button variant="outline" size="sm" disabled>
          Desativado
        </Button>
        <Badge>novo</Badge>
        <Card>
          <CardHeader>
            <CardTitle>Card</CardTitle>
          </CardHeader>
          <CardContent>conteúdo</CardContent>
        </Card>
        <Label htmlFor="i">Rótulo</Label>
        <Input id="i" placeholder="digite" />
        <Checkbox aria-label="marca" />
        <Switch aria-label="liga" />
        <Skeleton className="h-4 w-10" />
        <Separator />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Col</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>1</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Select>
          <SelectTrigger aria-label="escolha">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">A</SelectItem>
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger>menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog>
          <DialogTrigger>abrir</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Título</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger>abrir sheet</SheetTrigger>
          <SheetContent>lado</SheetContent>
        </Sheet>
        <Tooltip>
          <TooltipTrigger>alvo</TooltipTrigger>
          <TooltipContent>dica</TooltipContent>
        </Tooltip>
      </div>,
    ),
  )
})

test('componentes de estado renderizam sem erro de console', () => {
  expectNoConsoleError(() =>
    renderWithProviders(
      <div>
        <Carregando />
        <EstadoVazio title="Vazio">nada aqui</EstadoVazio>
        <EstadoErro title="Falhou" onRetry={() => {}} />
      </div>,
    ),
  )
})
