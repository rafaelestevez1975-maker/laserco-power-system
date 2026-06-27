'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moedaBR, dataBR, waHref } from '@/lib/fmt'
import { salvarColaborador, inativarColaborador, reativarColaborador, type ColaboradorInput } from '@/app/(app)/colaboradores/actions'
import { CARGO_LABELS, REGIME_LABELS, TIPO_LABELS, cargoLabel, regimeLabel, tipoLabel } from './labels'

export type ColaboradorFull = {
  id: string
  unidade_id: string | null
  perfil_id: string | null
  nome: string | null
  cpf: string | null
  rg: string | null
  data_nascimento: string | null
  email: string | null
  telefone: string | null
  cargo: string | null
  departamento: string | null
  area: string | null
  regime: string | null
  tipo: string | null
  data_admissao: string | null
  data_demissao: string | null
  status: string | null
  salario_bruto: number | null
  salario_liquido: number | null
  banco: string | null
  agencia: string | null
  conta: string | null
  pix: string | null
  jornada_semanal_horas: number | null
  jornada_diaria_horas: number | null
  home_office_autorizado: boolean | null
  endereco_residencial: string | null
  criado_em: string | null
}

type Tab = 'dados' | 'profissional'

function toInput(c: ColaboradorFull): ColaboradorInput {
  return {
    nome: c.nome ?? '', cpf: c.cpf ?? '', rg: c.rg ?? '', data_nascimento: c.data_nascimento ?? '',
    email: c.email ?? '', telefone: c.telefone ?? '', cargo: c.cargo ?? '', departamento: c.departamento ?? '',
    area: c.area ?? '', regime: c.regime ?? 'clt', tipo: c.tipo ?? 'loja', data_admissao: c.data_admissao ?? '',
    salario_bruto: c.salario_bruto != null ? String(c.salario_bruto).replace('.', ',') : '',
    salario_liquido: c.salario_liquido != null ? String(c.salario_liquido).replace('.', ',') : '',
    banco: c.banco ?? '', agencia: c.agencia ?? '', conta: c.conta ?? '', pix: c.pix ?? '',
    jornada_semanal_horas: c.jornada_semanal_horas != null ? String(c.jornada_semanal_horas) : '',
    jornada_diaria_horas: c.jornada_diaria_horas != null ? String(c.jornada_diaria_horas) : '',
    home_office_autorizado: !!c.home_office_autorizado, endereco_residencial: c.endereco_residencial ?? '',
    unidade_id: c.unidade_id,
  }
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }

export function ColaboradorFicha({
  colaborador, unidadeNome, podeEscrever,
}: { colaborador: ColaboradorFull; unidadeNome: string | null; podeEscrever: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('dados')
  const [edit, setEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [f, setF] = useState<ColaboradorInput>(() => toInput(colaborador))

  const c = colaborador
  const inativo = c.status === 'inativo'
  const set = (k: keyof ColaboradorInput, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))
  const iniciais = (c.nome || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const wa = waHref(c.telefone)

  function validar(): string | null {
    const nome = (f.nome || '').trim()
    if (!nome) return 'Informe o nome do colaborador.'
    const cpf = (f.cpf || '').replace(/\D/g, '')
    if (!cpf) return 'CPF é obrigatório.'
    if (cpf.length !== 11) return 'CPF deve ter 11 dígitos.'
    const email = (f.email || '').trim()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'E-mail inválido.'
    const tel = (f.telefone || '').replace(/\D/g, '')
    if (tel && (tel.length < 10 || tel.length > 13)) return 'Telefone inválido.'
    return null
  }

  async function salvar() {
    setErr(''); setOk('')
    const v = validar()
    if (v) { setErr(v); return }
    setSaving(true)
    const res = await salvarColaborador(c.id, f)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    setOk('Alterações salvas.')
    setEdit(false)
    router.refresh()
  }

  async function toggleStatus() {
    setErr(''); setOk('')
    setSaving(true)
    const res = inativo ? await reativarColaborador(c.id) : await inativarColaborador(c.id)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao alterar status.'); return }
    setOk(inativo ? 'Colaborador reativado.' : 'Colaborador inativado.')
    router.refresh()
  }

  function cancelarEdicao() {
    setF(toInput(c)); setEdit(false); setErr('')
  }

  // valor (modo leitura) ou input (modo edição)
  const Campo = ({ label, k, type = 'text', placeholder }: { label: string; k: keyof ColaboradorInput; type?: string; placeholder?: string }) => (
    <div>
      <label style={lbl}>{label}</label>
      {edit
        ? <input style={inp} type={type} value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
        : <div style={{ fontSize: 13.5, color: 'var(--text)', minHeight: 20 }}>{(f[k] as string)?.trim() || <span className="muted">—</span>}</div>}
    </div>
  )

  return (
    <div>
      {/* Cabeçalho */}
      <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', fontSize: 20, fontWeight: 800, flexShrink: 0 }}>{iniciais || '?'}</span>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            {c.nome || '(sem nome)'}
            {inativo
              ? <span className="os-st os-cancelada">Inativo</span>
              : <span className="os-st os-fechada">Ativo</span>}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
            {cargoLabel(c.cargo)} · {regimeLabel(c.regime)} · {tipoLabel(c.tipo)}
            {unidadeNome ? ` · ${unidadeNome}` : ''}
          </p>
        </div>
        {podeEscrever && (
          <div style={{ display: 'flex', gap: 8 }}>
            {!edit && <button className="btn" onClick={() => { setEdit(true); setOk(''); setTab('dados') }}><i className="ti ti-edit" /> Editar</button>}
            <button className="btn" style={inativo ? { color: 'var(--green)' } : { color: 'var(--red)' }} onClick={toggleStatus} disabled={saving}>
              <i className={`ti ${inativo ? 'ti-rotate-clockwise' : 'ti-user-off'}`} /> {inativo ? 'Reativar' : 'Inativar'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="rel-tabs">
        <div className={`rel-tab ${tab === 'dados' ? 'active' : ''}`} onClick={() => setTab('dados')}><i className="ti ti-user" /> Dados básicos</div>
        <div className={`rel-tab ${tab === 'profissional' ? 'active' : ''}`} onClick={() => setTab('profissional')}><i className="ti ti-id-badge-2" /> Profissional &amp; RH</div>
      </div>

      {ok && <p style={{ color: '#15803D', background: '#E7F0EC', borderRadius: 8, padding: '8px 11px', fontSize: 12.5, marginBottom: 12 }}><i className="ti ti-check" /> {ok}</p>}
      {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}><i className="ti ti-alert-triangle" /> {err}</p>}

      {tab === 'dados' && (
        <div className="rel-card">
          <div className="set-sec">Identificação</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            <Campo label="Nome" k="nome" />
            <Campo label="CPF" k="cpf" placeholder="000.000.000-00" />
            <Campo label="RG" k="rg" />
            <Campo label="Nascimento" k="data_nascimento" type="date" />
            <div>
              <label style={lbl}>Telefone</label>
              {edit
                ? <input style={inp} value={f.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} placeholder="(00) 90000-0000" />
                : <div style={{ fontSize: 13.5 }}>{f.telefone?.trim() || <span className="muted">—</span>}{wa && <a href={wa} target="_blank" rel="noopener" className="wa-link"><i className="ti ti-brand-whatsapp wa" /></a>}</div>}
            </div>
            <Campo label="E-mail" k="email" />
          </div>

          <div className="set-sec" style={{ marginTop: 18 }}>Lotação</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            <div>
              <label style={lbl}>Cargo</label>
              {edit
                ? <select style={inp} value={f.cargo} onChange={(e) => set('cargo', e.target.value)}>
                    <option value="">—</option>
                    {/* mantém o cargo atual do banco mesmo se fora da lista conhecida */}
                    {f.cargo && !CARGO_LABELS[f.cargo] && <option value={f.cargo}>{f.cargo}</option>}
                    {Object.entries(CARGO_LABELS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                : <div style={{ fontSize: 13.5 }}>{cargoLabel(c.cargo)}</div>}
            </div>
            <div>
              <label style={lbl}>Regime</label>
              {edit
                ? <select style={inp} value={f.regime} onChange={(e) => set('regime', e.target.value)}>{Object.entries(REGIME_LABELS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                : <div style={{ fontSize: 13.5 }}>{regimeLabel(c.regime)}</div>}
            </div>
            <div>
              <label style={lbl}>Tipo</label>
              {edit
                ? <select style={inp} value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>{Object.entries(TIPO_LABELS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                : <div style={{ fontSize: 13.5 }}>{tipoLabel(c.tipo)}</div>}
            </div>
            <Campo label="Área" k="area" />
            <Campo label="Departamento" k="departamento" />
            <Campo label="Admissão" k="data_admissao" type="date" />
          </div>

          {c.data_demissao && (
            <p style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 12 }}><i className="ti ti-user-off" /> Demissão registrada em {dataBR(c.data_demissao)}.</p>
          )}

          {edit && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn" onClick={cancelarEdicao} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={saving}><i className="ti ti-device-floppy" /> {saving ? 'Salvando…' : 'Salvar'}</button>
            </div>
          )}
        </div>
      )}

      {tab === 'profissional' && (
        <div className="rel-card">
          <div className="set-sec">Remuneração &amp; jornada</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            <div>
              <label style={lbl}>Salário bruto</label>
              {edit ? <input style={inp} value={f.salario_bruto ?? ''} onChange={(e) => set('salario_bruto', e.target.value)} placeholder="0,00" />
                : <div style={{ fontSize: 13.5 }}>{c.salario_bruto != null ? moedaBR(c.salario_bruto) : <span className="muted">—</span>}</div>}
            </div>
            <div>
              <label style={lbl}>Salário líquido</label>
              {edit ? <input style={inp} value={f.salario_liquido ?? ''} onChange={(e) => set('salario_liquido', e.target.value)} placeholder="0,00" />
                : <div style={{ fontSize: 13.5 }}>{c.salario_liquido != null ? moedaBR(c.salario_liquido) : <span className="muted">—</span>}</div>}
            </div>
            <div />
            <Campo label="Jornada semanal (h)" k="jornada_semanal_horas" />
            <Campo label="Jornada diária (h)" k="jornada_diaria_horas" />
            <div>
              <label style={lbl}>Home office</label>
              {edit
                ? <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={!!f.home_office_autorizado} onChange={(e) => set('home_office_autorizado', e.target.checked)} /> Autorizado</label>
                : <div style={{ fontSize: 13.5 }}>{c.home_office_autorizado ? 'Autorizado' : 'Não'}</div>}
            </div>
          </div>

          <div className="set-sec" style={{ marginTop: 18 }}>Dados bancários</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            <Campo label="Banco" k="banco" />
            <Campo label="Agência" k="agencia" />
            <Campo label="Conta" k="conta" />
            <Campo label="Pix" k="pix" />
          </div>

          <div className="set-sec" style={{ marginTop: 18 }}>Endereço</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <Campo label="Endereço residencial" k="endereco_residencial" />
          </div>

          {/* TODO(legado: buildServicosExecutados): bloco "Serviços que o colaborador executa"
              + % comissão padrão (legacy colabServRender). A tabela colaborador_servicos NÃO
              existe no schema lkii — precisa de migration para virar funcional. */}
          <div className="rel-legend" style={{ marginTop: 18 }}>
            <i className="ti ti-info-circle" /> Serviços executados e % de comissão por colaborador ainda não estão no schema (requer migration). {/* TODO(legado: buildServicosExecutados) */}
          </div>

          {edit && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn" onClick={cancelarEdicao} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={saving}><i className="ti ti-device-floppy" /> {saving ? 'Salvando…' : 'Salvar'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
