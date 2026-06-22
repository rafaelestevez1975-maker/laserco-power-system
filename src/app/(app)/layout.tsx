import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/session'
import { AppShell } from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext()
  if (!ctx) redirect('/login')

  return (
    <AppShell
      user={{ nome: ctx.nome, email: ctx.email, iniciais: ctx.iniciais, papel: ctx.papel, isAdmin: ctx.isAdmin }}
      recursos={ctx.recursos}
      units={ctx.unidades}
      activeUnitId={ctx.activeUnitId}
      activeUnitName={ctx.activeUnitName}
    >
      {children}
    </AppShell>
  )
}
