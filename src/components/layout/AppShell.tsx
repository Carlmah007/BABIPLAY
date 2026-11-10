import type { ReactNode } from 'react'
import { useHashPath } from '../../app/router'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  const path = useHashPath()

  return (
    <div className="min-h-svh bg-slate-50">
      <Sidebar />
      <div className="lg:pl-64">
        <Header />
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          <div key={path} className="anim-fade-up">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
