'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { renomearGrupo } from '@/app/(app)/servicos/actions'

export type GrupoInfo = { nome: string; total: number; ativos: number }

/**
 * "Grupo de serviços" = valores distintos de servicos.grupo (não há tabela de grupos
 * no backend lkii — 404 na introspecção). Exibimos como chips clicáveis (filtram a lista)
 * e, para gestor/admin, permitimos renomear (update em massa). Criar grupo = criar/editar
 * um serviço com o novo grupo (feito no modal de serviço). Excluir grupo não se aplica:
 * sumiria sozinho ao não restar nenhum serviço com aquele valor.
 */
export function GruposManager({
  grupos, semGrupo, grupoAtivo, podeEscrever,
}: { grupos: GrupoInfo[]; semGrupo: number; grupoAtivo: string; podeEscrever: boolean }) {
  const router = useRouter()
  const [editGrupo, setEditGrupo] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function irPara(g: string) {
    const url = g ? `/servicos?grupo=${encodeURIComponent(g)}` : '/servicos'
    router.push(url)
  }

  function abrirEdicao(g: string) {
    setEditGrupo(g); setNovoNome(g); setErr('')
  }

  async function salvar() {
    setErr('')
    const para = novoNome.trim()
    if (!para) { setErr('Informe o novo nome.'); return }
    if (para === editGrupo) { setEditGrupo(null); return }
    setSaving(true)
    const r = await renomearGrupo(editGrupo!, para)
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao renomear.'); return }
    setEditGrupo(null)
    router.refresh()
  }

  if (grupos.length === 0 && semGrupo === 0) return null

  return (
    <div className="rel-card" style={{ marginBottom: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <i className="ti ti-list-details" style={{ color: 'var(--brand-500)' }} />
        <b style={{ fontSize: 13 }}>Grupos de serviços</b>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>· {grupos.length} grupo(s)</span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className={`btn${!grupoAtivo ? ' btn-primary' : ''}`}
          onClick={() => irPara('')}
          style={{ fontSize: 12.5 }}
        >
          Todos
        </button>
        {grupos.map((g) => (
          <span key={g.nome} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button
              className={`btn${grupoAtivo === g.nome ? ' btn-primary' : ''}`}
              onClick={() => irPara(g.nome)}
              style={{ fontSize: 12.5 }}
              title={`${g.ativos} ativo(s) de ${g.total}`}
            >
              {g.nome} <span style={{ opacity: 0.7 }}>({g.total})</span>
            </button>
            {podeEscrever && (
              <button className="ico-btn" onClick={() => abrirEdicao(g.nome)} title="Renomear grupo"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}>
                <i className="ti ti-pencil" style={{ fontSize: 14 }} />
              </button>
            )}
          </span>
        ))}
        {semGrupo > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginLeft: 4 }}>
            <i className="ti ti-alert-triangle" /> {semGrupo} sem grupo
          </span>
        )}
      </div>

      {editGrupo && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setEditGrupo(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, padding: 22, background: '#fff', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
            <h3 style={{ fontSize: 17, marginBottom: 6, fontWeight: 700 }}>Renomear grupo</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 14 }}>
              Atualiza o grupo de todos os serviços de <b>{editGrupo}</b>.
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Novo nome</label>
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') salvar() }}
              style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, marginTop: 4 }}
            />
            {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => setEditGrupo(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={salvar}>{saving ? 'Salvando…' : 'Renomear'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
