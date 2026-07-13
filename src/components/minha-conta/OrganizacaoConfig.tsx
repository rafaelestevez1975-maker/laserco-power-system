'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarOrganizacao, type TemaOrg, type InformarVendedorOs } from '@/app/(app)/minha-conta/actions'
import { MinhaContaPanel, type PerfilDados } from '@/components/unidades/MinhaContaPanel'

export type OrganizacaoDados = {
  empresa_id: string
  nome: string | null
  tema: TemaOrg | null
  subdominio: string | null
  validade_pontos_meses: number | null
  informar_vendedor_os: InformarVendedorOs | null
  bloquear_inadimplente: boolean | null
  agendamento_online: boolean | null
  razao_social: string | null
  cnpj: string | null
}

const SUFIXO_SUBDOMINIO = '.laserco.app'

const TEMA_OPCOES: { value: TemaOrg; label: string }[] = [
  { value: 'azul_claro', label: 'Azul Claro' },
  { value: 'roxo', label: 'Roxo' },
  { value: 'dourado', label: 'Dourado' },
  { value: 'escuro', label: 'Escuro' },
]

const VENDEDOR_OPCOES: { value: InformarVendedorOs; label: string }[] = [
  { value: 'obrigatorio', label: 'Obrigatório' },
  { value: 'opcional', label: 'Opcional' },
  { value: 'nao', label: 'Não' },
]

type AbaId = 'basicos' | 'agendamento' | 'contratuais'
const ABAS: { id: AbaId; label: string; icon: string }[] = [
  { id: 'basicos', label: 'Dados básicos', icon: 'ti-settings' },
  { id: 'agendamento', label: 'Agendamento online', icon: 'ti-calendar-event' },
  { id: 'contratuais', label: 'Dados contratuais', icon: 'ti-file-certificate' },
]

/** "Minha conta" (espelho do BEMP): configuração da ORGANIZAÇÃO em abas.
 *  Edição só para admin (ehAdmin); demais veem em modo leitura. O perfil pessoal
 *  do usuário fica numa seção "Meu perfil" ao fim. */
export function OrganizacaoConfig({
  org,
  perfil,
  ehAdmin,
}: {
  org: OrganizacaoDados | null
  perfil: PerfilDados | null
  ehAdmin: boolean
}) {
  const router = useRouter()
  const [aba, setAba] = useState<AbaId>('basicos')
  const [f, setF] = useState({
    nome: org?.nome ?? '',
    tema: (org?.tema ?? 'azul_claro') as TemaOrg,
    subdominio: org?.subdominio ?? '',
    validade_pontos_meses: org?.validade_pontos_meses != null ? String(org.validade_pontos_meses) : '',
    informar_vendedor_os: (org?.informar_vendedor_os ?? 'opcional') as InformarVendedorOs,
    agendamento_online: !!org?.agendamento_online,
    bloquear_inadimplente: !!org?.bloquear_inadimplente,
    razao_social: org?.razao_social ?? '',
    cnpj: org?.cnpj ?? '',
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const ro = !ehAdmin // read-only quando não é admin

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    if (!ehAdmin) return
    if (!f.nome.trim()) { setErr('Informe o nome da organização.'); return }
    setSaving(true)
    const r = await salvarOrganizacao({
      nome: f.nome,
      tema: f.tema,
      subdominio: f.subdominio,
      validade_pontos_meses: f.validade_pontos_meses.trim() === '' ? null : Number(f.validade_pontos_meses),
      informar_vendedor_os: f.informar_vendedor_os,
      agendamento_online: f.agendamento_online,
      bloquear_inadimplente: f.bloquear_inadimplente,
      razao_social: f.razao_social || null,
      cnpj: f.cnpj || null,
    })
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    setMsg('Configuração da organização salva.')
    router.refresh()
  }

  if (!org) {
    return (
      <div className="view active">
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-building-off" style={{ fontSize: 26, display: 'block', marginBottom: 10 }} />
          Configuração da organização ainda não disponível neste ambiente.
        </div>
      </div>
    )
  }

  return (
    <div className="view active">
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-building-cog" style={{ color: 'var(--brand-500)' }} /> Minha conta
          {org.nome && <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 400 }}>· {org.nome}</span>}
        </h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
          Configuração da organização (aparência, agendamento e dados contratuais).
          {ro && ' Somente leitura — apenas o administrador geral pode editar.'}
        </p>
      </div>

      <form onSubmit={submit} className="rel-card" style={{ maxWidth: 720 }}>
        <div className="rel-tabs" style={{ marginBottom: 16 }}>
          {ABAS.map((a) => (
            <div key={a.id} className={`rel-tab ${aba === a.id ? 'active' : ''}`} onClick={() => setAba(a.id)}>
              <i className={`ti ${a.icon}`} style={{ marginRight: 6 }} /> {a.label}
            </div>
          ))}
        </div>

        {aba === 'basicos' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="mf full" style={{ gridColumn: '1 / -1' }}>
              <label>Nome da organização <span className="req">*</span></label>
              <input value={f.nome} onChange={(e) => set('nome', e.target.value)} disabled={ro} />
            </div>
            <div className="mf">
              <label>Tema de cores</label>
              <select value={f.tema} onChange={(e) => set('tema', e.target.value as TemaOrg)} disabled={ro}>
                {TEMA_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="mf">
              <label>Subdomínio</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  value={f.subdominio}
                  onChange={(e) => set('subdominio', e.target.value)}
                  disabled={ro}
                  placeholder="minhaloja"
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{SUFIXO_SUBDOMINIO}</span>
              </div>
            </div>
            <div className="mf">
              <label>Validade dos pontos (meses)</label>
              <input
                type="number"
                min={0}
                max={240}
                value={f.validade_pontos_meses}
                onChange={(e) => set('validade_pontos_meses', e.target.value)}
                disabled={ro}
                placeholder="12"
              />
            </div>
            <div className="mf">
              <label>Informar usuário que vendeu a OS</label>
              <select
                value={f.informar_vendedor_os}
                onChange={(e) => set('informar_vendedor_os', e.target.value as InformarVendedorOs)}
                disabled={ro}
              >
                {VENDEDOR_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {aba === 'agendamento' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <Toggle
              label="Agendamento online"
              hint="Permite que clientes agendem pelo site/app."
              checked={f.agendamento_online}
              disabled={ro}
              onChange={(v) => set('agendamento_online', v)}
            />
            <Toggle
              label="Bloquear inadimplente"
              hint="Impede novos agendamentos de clientes com pendências financeiras."
              checked={f.bloquear_inadimplente}
              disabled={ro}
              onChange={(v) => set('bloquear_inadimplente', v)}
            />
          </div>
        )}

        {aba === 'contratuais' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="mf full" style={{ gridColumn: '1 / -1' }}>
              <label>Razão social</label>
              <input value={f.razao_social} onChange={(e) => set('razao_social', e.target.value)} disabled={ro} />
            </div>
            <div className="mf">
              <label>CNPJ</label>
              <input value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} disabled={ro} placeholder="00.000.000/0000-00" />
            </div>
          </div>
        )}

        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 12 }}>{err}</p>}
        {msg && <p style={{ color: 'var(--brand-600)', fontSize: 12.5, marginTop: 12 }}>{msg}</p>}

        {ehAdmin && (
          <div className="rel-acts" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : (<><i className="ti ti-device-floppy" /> Salvar</>)}
            </button>
          </div>
        )}
      </form>

      {/* Perfil PESSOAL do usuário — antes era o foco da tela; agora é secundário (espelho BEMP). */}
      <div style={{ maxWidth: 720, marginTop: 28 }}>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 20, marginBottom: 4 }}>
          <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-user-circle" style={{ color: 'var(--brand-500)' }} /> Meu perfil
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Seus dados pessoais de acesso.</p>
        </div>
        <MinhaContaPanel perfil={perfil} />
      </div>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        background: 'var(--surface-2)',
        borderRadius: 10,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span>
        <span style={{ fontSize: 13.5, fontWeight: 600, display: 'block' }}>{label}</span>
        {hint && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: 'var(--brand-500)' }}
      />
    </label>
  )
}
