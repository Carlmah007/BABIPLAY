import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import type { IconName } from '../components/ui/Icon'

interface PlaceholderPageProps {
  title: string
  description: string
  icon: IconName
  moduleName: string
}

/**
 * Page temporaire utilisée pendant la construction progressive.
 * Chaque module est remplacé par son implémentation réelle dans son paquet dédié.
 */
export function PlaceholderPage({ title, description, icon, moduleName }: PlaceholderPageProps) {
  return (
    <div>
      <PageHeader title={title} description={description} eyebrow="Module en préparation" />
      <Card>
        <EmptyState
          icon={icon}
          title={`${moduleName} sera activé prochainement`}
          description="Ce module arrive bientôt."
        />
      </Card>
    </div>
  )
}
