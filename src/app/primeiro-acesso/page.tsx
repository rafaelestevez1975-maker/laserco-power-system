import { createClient } from '@/lib/supabase/server'
import { PrimeiroAcessoForm } from './PrimeiroAcessoForm'

export const dynamic = 'force-dynamic'

export default async function PrimeiroAcessoPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  const emailAtual = user?.email ?? ''

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#f7f3f4,#efe6e9)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', border: '1px solid #e7dde0', borderRadius: 14, padding: '28px 26px', boxShadow: '0 10px 40px rgba(109,26,46,.10)' }}>
        <div style={{ fontSize: 30, marginBottom: 4 }}>🔐</div>
        <h1 style={{ fontSize: 21, color: '#6d1a2e', margin: '0 0 6px', letterSpacing: '-.3px' }}>Primeiro acesso</h1>
        <p style={{ fontSize: 13.5, color: '#5a4650', margin: '0 0 4px', lineHeight: 1.5 }}>
          Bem-vindo(a) ao Laser&amp;Co Power System. Este é seu primeiro acesso — defina agora o <b>e-mail</b> e a <b>senha</b> que você vai usar de verdade.
        </p>
        <p style={{ fontSize: 12, color: '#8a8f99', margin: '0 0 16px' }}>
          Login temporário: <b>{emailAtual}</b>
        </p>
        <PrimeiroAcessoForm emailAtual={emailAtual} />
      </div>
    </div>
  )
}
