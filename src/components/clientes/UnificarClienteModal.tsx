'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dataBR } from '@/lib/fmt'
import { listarDuplicados, unificarClientes, type DupCliente } from '@/app/(app)/clientes/actions'

/**
 * Modal de unificação de cadastros duplicados (legado cliUnificar/cliUnificarConfirm, 3038-3058).
 * Carrega os cadastros com o mesmo nome ordenados por score, marca o preferido (1º) e,
 * ao confirmar, mantém o preferido e inativa os demais (merge de campos vazios no servidor).
 */
export function UnificarClienteModal({ clienteId, onClose }: { clienteId: string; onClose: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dups, setDups] = useState<DupCliente[]>([])
  const [manterId, setManterId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    listarDuplicados(clienteId).then((res) => {
      if (!alive) return
      if (!res.ok) { setErr(res.error || 'Erro ao carregar cadastros.'); setLoading(false); return }
      const d = res.duplicados ?? []
      setDups(d)
      setManterId(d[0]?.id ?? '')
      setLoading(false)
    })
    return () => { alive = false }
  }, [clienteId])

  async function confirmar() {
    if (!manterId) return
    const remover = dups.filter((d) => d.id !== manterId).map((d) => d.id)
    if (!remover.length) { setErr('Não há cadastros secundários para unificar.'); return }
    setBusy(true); setErr('')
    const res = await unificarClientes(manterId, remover)
    setBusy(false)
    if (!res.ok) { setErr(res.error || 'Erro ao unificar.'); return }
    onClose()
    if (res.id && res.id !== clienteId) router.push(`/clientes/${res.id}`)
    else router.refresh()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 580, padding: 22, background: '#fff', borderRadius: 14, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}><i className="ti ti-users-group" /> Unificar cliente</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Fechar"><i className="ti ti-x" /></button>
        </div>

        {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}><i className="ti ti-loader" /> Carregando cadastros…</div>}

        {!loading && dups.length < 2 && (
          <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 13 }}>Não há cadastros duplicados para unificar.</div>
        )}

        {!loading && dups.length >= 2 && (
          <>
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12 }}>
              <i className="ti ti-alert-triangle" /> Encontramos <b>{dups.length} cadastros</b> do mesmo cliente (mesmo nome / CPF / telefone). A unificação <b>mantém os dados dos cadastros</b>, dando preferência ao que possui mais histórico (pacotes, créditos, base legada). Escolha o cadastro preferido:
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {dups.map((c) => {
                const pref = c.id === manterId
                return (
                  <label key={c.id} style={{ display: 'block', border: `1px solid ${pref ? 'var(--brand-500)' : 'var(--line)'}`, borderRadius: 9, padding: 11, cursor: 'pointer', background: pref ? '#f6e8ec' : '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="radio" name="manter" checked={pref} onChange={() => setManterId(c.id)} />
                      <span style={{ fontWeight: 700 }}>{c.nome || '(sem nome)'}</span>
                      {pref && <span className="os-st os-fechada" style={{ marginLeft: 'auto' }}>Cadastro preferido</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, marginLeft: 24 }}>
                      Tel: {c.telefone || ''} · CPF: {c.cpf || ''} · desde {c.criado_em ? dataBR(c.criado_em) : ''} · score {c.score}
                    </div>
                  </label>
                )
              })}
            </div>

            {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={onClose}>Agora não</button>
              <button className="btn btn-primary" onClick={confirmar} disabled={busy || !manterId}>
                <i className="ti ti-check" /> {busy ? 'Unificando…' : 'Unificar cadastros'}
              </button>
            </div>
          </>
        )}

        {!loading && dups.length < 2 && err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      </div>
    </div>
  )
}
