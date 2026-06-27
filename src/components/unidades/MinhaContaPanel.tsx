'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarMinhaConta } from '@/app/(app)/minha-conta/actions'

export type PerfilDados = {
  id: string
  nome_completo: string | null
  email: string | null
  telefone: string | null
  papel: string | null
  status: string | null
}

const PAPEL_LABEL: Record<string, string> = {
  admin_geral: 'Administrador geral',
  proprietario: 'Proprietário',
  gestor: 'Gestor',
  operacoes: 'Operações',
  financeiro: 'Financeiro',
  rh: 'RH',
  crm: 'CRM',
  sac: 'SAC',
  tecnico: 'Técnico',
  colaborador: 'Colaborador',
}

export function MinhaContaPanel({ perfil }: { perfil: PerfilDados | null }) {
  const router = useRouter()
  const [f, setF] = useState({
    nome_completo: perfil?.nome_completo ?? '',
    telefone: perfil?.telefone ?? '',
  })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  if (!perfil) {
    return (
      <div className="view active">
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-user-off" style={{ fontSize: 26, display: 'block', marginBottom: 10 }} />
          Não foi possível carregar seu perfil. Faça login novamente.
        </div>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    if (!f.nome_completo.trim()) { setErr('Informe seu nome.'); return }
    if (f.telefone.trim()) {
      const dig = f.telefone.replace(/\D/g, '')
      if (dig.length < 10 || dig.length > 13) { setErr('Telefone inválido (use DDD + número).'); return }
    }
    setSaving(true)
    const r = await salvarMinhaConta({ nome_completo: f.nome_completo, telefone: f.telefone || null })
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    setMsg('Seus dados foram salvos.')
    router.refresh()
  }

  const papelLabel = perfil.papel ? (PAPEL_LABEL[perfil.papel] ?? perfil.papel) : '—'

  return (
    <div className="view active">
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-user-circle" style={{ color: 'var(--brand-500)' }} /> Minha conta
        </h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
          Seus dados de perfil. E-mail e papel são geridos pela administração.
        </p>
      </div>

      <form onSubmit={submit} className="rel-card" style={{ maxWidth: 640 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-id flt" /> Dados pessoais</span>
          <span>
            {perfil.status === 'inativo'
              ? <span className="os-st os-cancelada">Inativo</span>
              : <span className="os-st os-fechada">Ativo</span>}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Nome completo <span className="req">*</span></label>
            <input value={f.nome_completo} onChange={(e) => set('nome_completo', e.target.value)} autoFocus />
          </div>
          <div className="mf">
            <label>E-mail</label>
            <input value={perfil.email ?? ''} disabled title="E-mail gerido pela administração / login" />
          </div>
          <div className="mf">
            <label>Telefone</label>
            <input value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(11) 90000-0000" />
          </div>
          <div className="mf">
            <label>Papel / cargo</label>
            <input value={papelLabel} disabled title="Papel gerido pela administração (RH / Perfis)" />
          </div>
        </div>
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 12 }}>{err}</p>}
        {msg && <p style={{ color: 'var(--brand-600)', fontSize: 12.5, marginTop: 12 }}>{msg}</p>}
        <div className="rel-acts" style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : (<><i className="ti ti-device-floppy" /> Salvar</>)}
          </button>
        </div>
      </form>

      {/* TODO(legado: buildUni) — tema/cor da marca + subdomínio da organização. Sem coluna/tabela no lkii. */}
      <div className="rel-card" style={{ maxWidth: 640, marginTop: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-palette flt" /> Aparência e subdomínio</span>
        </div>
        <div style={{ textAlign: 'center', padding: 28, color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: 10, marginTop: 12 }}>
          <i className="ti ti-database-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
          Personalização de tema e subdomínio ainda não disponível neste ambiente.
          <span style={{ display: 'block', fontSize: 11, marginTop: 6 }}>Aguardando configuração no backend.</span>
        </div>
      </div>
    </div>
  )
}
