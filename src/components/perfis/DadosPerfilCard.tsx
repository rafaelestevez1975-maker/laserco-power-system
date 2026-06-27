'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarCargo } from '@/app/(app)/perfis/actions'

type Props = {
  cargoId: string
  nome: string
  descricao: string | null
  ativo: boolean
  batePonto: boolean
  podeEditar: boolean
  temBatePonto: boolean
}

/** Card "Dados do perfil" do editor (legado HTML 1736-1741): input Nome + select Ativo.
 *  Aqui também expõe Descrição e Bate ponto, persistindo via atualizarCargo. */
export function DadosPerfilCard({ cargoId, nome, descricao, ativo, batePonto, podeEditar, temBatePonto }: Props) {
  const router = useRouter()
  const [vNome, setVNome] = useState(nome)
  const [vDesc, setVDesc] = useState(descricao ?? '')
  const [vAtivo, setVAtivo] = useState(ativo)
  const [vPonto, setVPonto] = useState(batePonto)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)

  const sujo = vNome !== nome || vDesc !== (descricao ?? '') || vAtivo !== ativo || vPonto !== batePonto

  async function salvar() {
    setMsg(null)
    if (vNome.trim().length < 2) { setMsg({ tipo: 'err', texto: 'Informe o nome do perfil (mín. 2 caracteres).' }); return }
    setBusy(true)
    const r = await atualizarCargo(cargoId, {
      nome: vNome.trim(),
      descricao: vDesc,
      ativo: vAtivo,
      ...(temBatePonto ? { batePonto: vPonto } : {}),
    })
    setBusy(false)
    if (!r.ok) { setMsg({ tipo: 'err', texto: r.error || 'Falha ao salvar.' }); return }
    setMsg({ tipo: 'ok', texto: 'Dados do perfil salvos.' })
    router.refresh()
  }

  return (
    <div className="rel-card" style={{ marginBottom: 18, padding: 16 }}>
      <h3 style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <i className="ti ti-shield-lock" style={{ color: 'var(--brand-500)' }} /> Dados do perfil
      </h3>

      {msg && (
        <div className="modal-note" style={{
          marginBottom: 12,
          background: msg.tipo === 'ok' ? 'var(--green-bg, #E7F6EC)' : 'var(--red-bg, #FBE9E9)',
          color: msg.tipo === 'ok' ? 'var(--green, #15803D)' : 'var(--red, #B91C1C)',
        }}>
          <i className={`ti ${msg.tipo === 'ok' ? 'ti-circle-check' : 'ti-alert-circle'}`} /> {msg.texto}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ display: 'block', marginBottom: 4 }}>Nome do perfil</span>
          <input value={vNome} onChange={(e) => setVNome(e.target.value)} disabled={!podeEditar} maxLength={80}
            style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)' }} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-2)', gridColumn: 'span 2' }}>
          <span style={{ display: 'block', marginBottom: 4 }}>Descrição</span>
          <input value={vDesc} onChange={(e) => setVDesc(e.target.value)} disabled={!podeEditar} maxLength={200}
            style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)' }} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ display: 'block', marginBottom: 4 }}>Ativo</span>
          <select value={vAtivo ? 'sim' : 'nao'} onChange={(e) => setVAtivo(e.target.value === 'sim')} disabled={!podeEditar}
            style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)' }}>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </label>
        {temBatePonto && (
          <label style={{ fontSize: 12, color: 'var(--text-2)' }}>
            <span style={{ display: 'block', marginBottom: 4 }}>Bate ponto</span>
            <select value={vPonto ? 'sim' : 'nao'} onChange={(e) => setVPonto(e.target.value === 'sim')} disabled={!podeEditar}
              style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)' }}>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
        )}
      </div>

      {podeEditar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-primary" onClick={salvar} disabled={busy || !sujo}>
            <i className="ti ti-device-floppy" /> {busy ? 'Salvando…' : 'Salvar dados'}
          </button>
        </div>
      )}
    </div>
  )
}
