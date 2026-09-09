import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import { Route, Routes, useSearchParams } from 'react-router'

import { AppShell } from '@/components/AppShell'
import { SidebarSection } from '@/components/shell/SidebarSlot'
import { renderWithProviders } from '@/test/render'

/**
 * Task 4/08. Duas coisas sob teste, ambas sobre o que acontece quando algo dá errado: o
 * conteúdo da tela chega à sidebar sem a tela conhecer o layout, e uma tela que **quebra** não
 * leva a navegação junto.
 */

/** Monta o shell de verdade com uma tela dentro — é o shell que está sob teste. */
function renderNoShell(tela: ReactNode) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/refino" element={tela} />
        <Route path="/craft" element={<p>Tela de craft</p>} />
      </Route>
    </Routes>,
    { initialEntries: ['/refino'] },
  )
}

beforeEach(() => {
  localStorage.removeItem('albion-profit-pro:nav-collapsed')
  localStorage.setItem('albion-profit-pro:realm', 'west')
})

describe('SidebarSection', () => {
  test('a tela injeta filtros no painel da DIREITA, sem conhecer o layout do shell', async () => {
    renderNoShell(
      <SidebarSection title="Filtros">
        <input aria-label="Tier" />
      </SidebarSection>,
    )

    const campo = await screen.findByLabelText('Tier')

    // Desde a 11.1 os filtros ficam à direita e a esquerda é só navegação. O teste distingue
    // os dois painéis pelo nome acessível — se o portal apontasse para o lado errado, o campo
    // ainda existiria, só que no lugar errado, e um `querySelector('aside')` genérico não
    // notaria.
    const filtros = screen.getByRole('complementary', { name: 'Filtros' })
    expect(filtros.contains(campo)).toBe(true)
    expect(within(filtros).getByText('Filtros')).toBeInTheDocument()

    // E não vazou para a navegação.
    const navegacao = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(navegacao.contains(campo)).toBe(false)
  })

  test('sem filtros publicados, o painel direito não ocupa largura', () => {
    renderNoShell(<p>Tela sem filtros</p>)

    const filtros = screen.getByRole('complementary', { name: 'Filtros' })
    expect(filtros.className).toMatch(/\bw-0\b/)
  })
})

describe('navegação colapsável', () => {
  test('colapsar preserva o nome acessível dos links', async () => {
    const user = userEvent.setup()
    renderNoShell(<p>conteúdo</p>)

    await user.click(screen.getByRole('button', { name: 'Colapsar navegação' }))

    // Colapsada o rótulo visível some; sem `aria-label` o link viraria um ícone anônimo.
    expect(screen.getByRole('link', { name: 'Refino' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expandir navegação' }),
    ).toBeInTheDocument()
  })

  test('o estado de colapso sobrevive a uma remontagem', async () => {
    const user = userEvent.setup()
    const primeira = renderNoShell(<p>conteúdo</p>)

    await user.click(screen.getByRole('button', { name: 'Colapsar navegação' }))
    primeira.unmount()

    renderNoShell(<p>conteúdo</p>)
    // Quem colapsa quer colapsado amanhã também.
    expect(
      screen.getByRole('button', { name: 'Expandir navegação' }),
    ).toBeInTheDocument()
  })
})

describe('ErrorBoundary', () => {
  function TelaQueQuebra(): never {
    throw new Error('estouro no render')
  }

  test('erro de render vira estado de erro, e a navegação continua na tela', async () => {
    // O achado `E04` da Fase 3.5: sem boundary, isto era uma tela branca.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderNoShell(<TelaQueQuebra />)

    expect(
      await screen.findByText('Esta tela não pôde ser exibida'),
    ).toBeInTheDocument()

    // A diferença entre "essa tela falhou" e "o aplicativo morreu":
    expect(screen.getByRole('link', { name: /Refino/ })).toBeInTheDocument()
    expect(screen.getAllByLabelText('Servidor').length).toBeGreaterThan(0)

    consoleError.mockRestore()
  })

  test('"Tentar novamente" volta a montar a tela', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    let deveQuebrar = true
    function TelaInstavel() {
      if (deveQuebrar) throw new Error('estouro no render')
      return <p>Conteúdo recuperado</p>
    }

    renderNoShell(<TelaInstavel />)
    await screen.findByText('Esta tela não pôde ser exibida')

    deveQuebrar = false
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    await waitFor(() =>
      expect(screen.getByText('Conteúdo recuperado')).toBeInTheDocument(),
    )

    consoleError.mockRestore()
  })

  test('mudar de FILTRO limpa o erro, não só mudar de rota', async () => {
    // O que derruba a tela do scanner quase sempre é um filtro — ele alimenta o cálculo. Com o
    // `resetKey` só no pathname, o usuário ficava preso no estado de erro mexendo nos filtros,
    // porque a rota não muda; a única saída era F5 ou trocar de tela.
    //
    // O teste passa pelo shell inteiro de propósito: testar o `ErrorBoundary` direto passaria
    // antes e depois da correção, porque o componente sempre soube reagir ao `resetKey` — o
    // defeito estava em **o que o shell passava** para ele.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    function TelaQueQuebraComEsseFiltro() {
      const [params] = useSearchParams()
      if (params.get('qty') === '1500') throw new Error('estouro no render')
      return <p>Conteúdo com o outro filtro</p>
    }

    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/refino" element={<TelaQueQuebraComEsseFiltro />} />
        </Route>
      </Routes>,
      { initialEntries: ['/refino?qty=1500'] },
    )
    expect(await screen.findByText('Esta tela não pôde ser exibida')).toBeInTheDocument()

    // Mesma rota, outra query — é o que acontece ao mexer num filtro.
    await user.click(screen.getByRole('link', { name: 'Refino' }))

    expect(
      await screen.findByText('Conteúdo com o outro filtro'),
    ).toBeInTheDocument()
    consoleError.mockRestore()
  })

  test('navegar para outra rota limpa o erro sem precisar de F5', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    renderNoShell(<TelaQueQuebra />)
    await screen.findByText('Esta tela não pôde ser exibida')

    await user.click(screen.getByRole('link', { name: /Craft/ }))

    await waitFor(() =>
      expect(screen.getByText('Tela de craft')).toBeInTheDocument(),
    )
    expect(
      screen.queryByText('Esta tela não pôde ser exibida'),
    ).not.toBeInTheDocument()

    consoleError.mockRestore()
  })
})
