'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { abrirOS, type NovaOSInput } from '@/app/(app)/os/actions'

type Cliente = { id: string; nome: string }

const ORIGENS: { value: string; label: string }[] = [
  { value: 'avulsa', label: 'Avulsa (balcão)' },
  { value: 'agendamento', label: 'Agendamento' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'assinatura', label: 'Assinatura' },
  { value: 'interna', label: 'Interna' },
]

function NovaOSModal({
  activeUnitId, activeUnitName, clientes, onClose,
}: { activeUnitId: string | null; activeUnitName: string; clientes: Cliente[]; onClose: () => void }) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [origem, setOrigem] = useState('avulsa')
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return clientes.slice(0, 8)
    return clientes.filter((c) => c.nome.toLowerCase().includes(q)).slice(0, 8)
  }, [busca, clientes])

  const clienteNome = clientes.find((c) => c.id === clienteId)?.nome ?? ''

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!activeUnitId) { setErr('Selecione uma unidade ativa no topo para abrir a OS.'); return }
    setSaving(true)
    const input: NovaOSInput = {
      unidadeId: activeUnitId,
      clienteId: clienteId || null,
      origem,
      observacao: obs.trim() || null,
    }
    const res = await abrirOS(input)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao abrir OS.'); return }
    onClose()
    router.refresh()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, padding: 22, background: '#fff', borderRadius: 14, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <h3 style={{ fontSize: 18, marginBottom: 4, fontWeight: 700 }}>
          <i className="ti ti-clipboard-plus" /> Nova ordem de serviço
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
          <i className="ti ti-building-store" /> {activeUnitName}
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={lbl}>Cliente</label>
            {clienteId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, background: 'var(--surface-2)' }}>
                <i className="ti ti-user" style={{ color: 'var(--brand-500)' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{clienteNome}</span>
                <button type="button" className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '2px 8px' }} onClick={() => { setClienteId(''); setBusca('') }}>
                  <i className="ti ti-x" /> Trocar
                </button>
              </div>
            ) : (
              <>
                <input style={inp} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar cliente pelo nome…" autoFocus />
                {(busca.trim() || filtrados.length > 0) && (
                  <div style={{ marginTop: 6, border: '1px solid var(--line)', borderRadius: 8, maxHeight: 200, overflow: 'auto' }}>
                    {filtrados.length === 0 && (
                      <div style={{ padding: 10, fontSize: 12.5, color: 'var(--text-3)' }}>Nenhum cliente encontrado.</div>
                    )}
                    {filtrados.map((c) => (
                      <button key={c.id} type="button" onClick={() => setClienteId(c.id)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', fontSize: 13, background: 'none', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
                        {c.nome}
                      </button>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Opcional — deixe vazio para OS sem cliente (balcão).</p>
              </>
            )}
          </div>

          <div>
            <label style={lbl}>Origem</label>
            <select style={inp} value={origem} onChange={(e) => setOrigem(e.target.value)}>
              {ORIGENS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>Observação</label>
            <textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Anotações internas (opcional)" />
          </div>
        </div>

        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !activeUnitId}>
            {saving ? 'Abrindo…' : 'Abrir OS'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Botão "Nova OS" + modal (topo da lista). */
export function NovaOSButton({
  activeUnitId, activeUnitName, clientes,
}: { activeUnitId: string | null; activeUnitName: string; clientes: Cliente[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)} title={activeUnitId ? '' : 'Selecione uma unidade ativa'}>
        <i className="ti ti-plus" /> Nova OS
      </button>
      {open && (
        <NovaOSModal activeUnitId={activeUnitId} activeUnitName={activeUnitName} clientes={clientes} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
