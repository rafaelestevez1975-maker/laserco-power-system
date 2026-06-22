'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const params = useSearchParams()
  const raw = params.get('redirect') ?? '/'
  const redirect = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const sb = createClient()
    const { error } = await sb.auth.signInWithPassword({ email, password: senha })
    if (error) {
      setErro('E-mail ou senha incorretos, ou usuário inativo.')
      setLoading(false)
      return
    }
    // Hard navigation: garante que o cookie recém-setado vá na próxima request
    // (router.push faria client-side routing e o middleware devolveria /login).
    window.location.href = redirect
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-xl bg-gold-500 text-2xl font-extrabold text-brand-900">
            L
          </div>
          <h1 className="font-display text-2xl font-bold text-brand-700">Laser&amp;Co Power System</h1>
          <p className="mt-1 text-sm text-ink/50">Acesso à gestão da rede</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">E-mail</label>
            <input
              type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com"
              className="w-full rounded-lg border border-line px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Senha</label>
            <input
              type="password" required autoComplete="current-password" value={senha}
              onChange={(e) => setSenha(e.target.value)} placeholder="••••••••"
              className="w-full rounded-lg border border-line px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}

          <button type="submit" disabled={loading} className="lc-btn w-full py-3">
            {loading ? 'Aguarde…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
