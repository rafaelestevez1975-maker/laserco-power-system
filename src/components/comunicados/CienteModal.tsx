'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { marcarCiente } from '@/app/(app)/comunicados/actions'

export type PendenteCom = { id: string; titulo: string; mensagem: string; prioridade: string; autor: string | null; quando: string | null }

const PRIO: Record<string, [string, string, string]> = {
  normal: ['var(--blue)', 'ti-info-circle', 'Normal'],
  importante: ['var(--amber)', 'ti-alert-triangle', 'Importante'],
  urgente: ['var(--red)', 'ti-urgent', 'Urgente'],
}

/** Gate de leitura obrigatória: abre no 1º acesso e só libera após o "ciente"
 *  de cada comunicado obrigatório pendente. Não é dispensável (sem fechar/ESC). */
export function CienteModal({ comunicados }: { comunicados: PendenteCom[] }) {
  const router = useRouter()
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Checkbox obrigatório 'Li e compreendi' (legado #comReadMod 2635-2636): mantém o botão DESABILITADO até marcar.
  const [li, setLi] = useState(false)
  const atual = comunicados[i]
  if (!atual) return null
  const [cor, icone, label] = PRIO[atual.prioridade] ?? PRIO.normal

  function ciente() {
    if (!li) return
    setBusy(true); setErr('')
    marcarCiente(atual.id).then((r) => {
      setBusy(false)
      if (!r.ok) { setErr(r.error || 'Erro ao registrar o ciente.'); return }
      if (i + 1 < comunicados.length) { setI(i + 1); setLi(false) }
      else router.refresh()
    })
  }

  return (
    <div className="modal-ov open" style={{ zIndex: 400 }}>
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-head">
          <h3><i className="ti ti-speakerphone" /> Comunicado da rede  leitura obrigatória</h3>
          {comunicados.length > 1 && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{i + 1} de {comunicados.length}</span>}
        </div>
        <div className="modal-body" style={{ display: 'block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <span className="evt-type" style={{ background: `${cor}22`, color: cor }}><i className={`ti ${icone}`} /> {label}</span>
            {atual.quando && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(atual.quando).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>}
            {atual.autor && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>· por {atual.autor}</span>}
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{atual.titulo}</h3>
          <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{atual.mensagem}</div>
          {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        </div>
        <div className="modal-foot" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={li} onChange={(e) => setLi(e.target.checked)} /> Li e compreendi o comunicado
          </label>
          <button className="btn btn-primary" disabled={busy || !li} onClick={ciente}>
            {busy ? '…' : <><i className="ti ti-check" /> Ciente  entrar no sistema</>}
          </button>
        </div>
      </div>
    </div>
  )
}
