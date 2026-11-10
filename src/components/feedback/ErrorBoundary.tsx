import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Icon } from '../ui/Icon'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Aucun détail technique n'est exposé à l'utilisateur.
    console.error('[BabiPlay] Erreur UI', error.message, info.componentStack)
  }

  private reset = () => {
    this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-svh items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md text-center">
          <span className="mx-auto mb-4 inline-flex rounded-2xl bg-rose-50 p-3 text-rose-500">
            <Icon name="alert" size={26} />
          </span>
          <h1 className="text-xl font-semibold text-slate-900">L'application a rencontré un problème</h1>
          <p className="mt-2 text-sm text-slate-500">
            Vos données locales n'ont pas été modifiées. Rechargez l'interface pour continuer.
          </p>
          <Button className="mt-5" onClick={this.reset}>
            Réessayer
          </Button>
        </Card>
      </div>
    )
  }
}
