import { Analytics } from '@vercel/analytics/react'
import { AppProviders } from './app/AppProviders'
import { AppRouter } from './app/AppRouter'

function App() {
  return (
    <AppProviders>
      <AppRouter />
      <Analytics />
    </AppProviders>
  )
}

export default App
