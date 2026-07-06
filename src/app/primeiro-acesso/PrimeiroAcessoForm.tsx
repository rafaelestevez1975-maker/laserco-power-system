'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { concluirPrimeiroAcesso } from './actions'

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #d9cdd2', borderRadius: 9, fontSize: 14, marginTop: 4 }
const lbl: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: '#3a2230' }

export function PrimeiroAcessoForm({ emailAtual }: { emailAtual: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha !== conf) { setErro('As senhas não conferem.'); return }
    setBusy(true)
    const res = await concluirPrimeiroAcesso({ email, senha })
    setBusy(false)
    if (res.ok) {
      router.replace('/')
      router.refresh()
    } else {
      setErro(res.error || 'Não foi possível concluir. Tente novamente.')
    }
  }

  return (
    <form onSubmit={submit}>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Seu e-mail definitivo</label>
        <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu.email@exemplo.com" autoComplete="email" required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Nova senha</label>
        <input style={inp} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="mínimo 8 caracteres" autoComplete="new-password" required />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Confirme a nova senha</label>
        <input style={inp} type="password" value={conf} onChange={(e) => setConf(e.target.value)} placeholder="repita a senha" autoComplete="new-password" required />
      </div>

      {erro && <div style={{ background: '#fde8ea', color: '#b23545', border: '1px solid #f0cdd2', borderRadius: 8, padding: '8px 11px', fontSize: 12.5, marginBottom: 12 }}>{erro}</div>}

      <button type="submit" disabled={busy} style={{ width: '100%', padding: '11px 12px', background: busy ? '#a67885' : '#6d1a2e', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
        {busy ? 'Salvando…' : 'Concluir e entrar'}
      </button>
      <p style={{ fontSize: 11, color: '#8a8f99', marginTop: 12, textAlign: 'center' }}>
        Depois disto você entra sempre com o e-mail e a senha que acabou de definir.
      </p>
    </form>
  )
}
