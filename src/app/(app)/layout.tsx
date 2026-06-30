import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/session'
import { AppShell } from '@/components/layout/AppShell'
import { ComunicadosGate } from '@/components/comunicados/ComunicadosGate'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext()
  if (!ctx) redirect('/login')

  return (
    <>
      <AppShell
        user={{ nome: ctx.nome, email: ctx.email, iniciais: ctx.iniciais, papel: ctx.papel, isAdmin: ctx.isAdmin, sacOnline: ctx.sacOnline }}
        recursos={ctx.recursos}
        units={ctx.unidades}
        activeUnitId={ctx.activeUnitId}
        activeUnitName={ctx.activeUnitName}
        sacNivel={ctx.sacNivel}
      >
        {children}
      </AppShell>
      {/* Gate de leitura obrigatória (EPIC 19): abre no 1º acesso até dar "ciente". */}
      <ComunicadosGate />
    </>
  )
}
