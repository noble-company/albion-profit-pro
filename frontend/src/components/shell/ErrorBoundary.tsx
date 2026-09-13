import { Component, type ErrorInfo, type ReactNode } from 'react'

import { EstadoErro } from '@/components/ui/states'

/**
 * Achado `E04` da Fase 3.5: **não existia `ErrorBoundary` no projeto**. Um erro durante o
 * render — vírgula num campo de filtro, chunk lazy com hash velho depois de um deploy — virava
 * tela branca, sem nada na interface dizendo o que houve.
 *
 * Fica **dentro** do shell, envolvendo só o `Outlet`: a sidebar continua navegável quando uma
 * tela quebra. É a diferença entre "essa tela falhou" e "o aplicativo morreu".
 *
 * `resetKey` (a rota atual) faz o boundary se recuperar ao navegar. Sem isso o usuário ficaria
 * preso no estado de erro até dar F5, mesmo indo para uma tela sã.
 */

interface Props {
  children: ReactNode
  resetKey: string
}

interface State {
  error: Error | null
  /** rota em que o erro aconteceu — comparada com `resetKey` para saber se já saímos dela */
  errorKey: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorKey: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.error === null) return null
    if (state.errorKey === null) return { errorKey: props.resetKey }
    // Mudou de rota: limpa o erro e deixa a tela nova tentar renderizar.
    if (state.errorKey !== props.resetKey) return { error: null, errorKey: null }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sem serviço de telemetria no produto ainda; o console é o único destino honesto. Quando
    // houver, é aqui que o relatório sai.
    console.error('Erro não tratado ao renderizar a tela', error, info.componentStack)
  }

  private readonly retry = () => {
    this.setState({ error: null, errorKey: null })
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <EstadoErro
          title="Esta tela não pôde ser exibida"
          onRetry={this.retry}
        >
          Algo quebrou ao montar o conteúdo. A navegação ao lado continua
          funcionando — tente outra tela ou recarregue esta.
        </EstadoErro>
      )
    }
    return this.props.children
  }
}
