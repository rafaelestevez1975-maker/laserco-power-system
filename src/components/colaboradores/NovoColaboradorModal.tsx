'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarColaborador, checarCpfDuplicado, type ColaboradorInput } from '@/app/(app)/colaboradores/actions'
import { CARGO_LABELS, REGIME_LABELS, TIPO_LABELS } from './labels'

type Unidade = { id: string; nome: string }

export function NovoColaboradorModal({
  unidades, unidadeSugerida, isAdmin, activeUnitId,
}: { unidades: Unidade[]; unidadeSugerida: string | null; isAdmin: boolean; activeUnitId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState('')
  const [precisaForcar, setPrecisaForcar] = useState(false)
  const [secProf, setSecProf] = useState(false) // bloco profissional/RH (recolhível)
  const [f, setF] = useState<ColaboradorInput>({
    nome: '', cpf: '', rg: '', data_nascimento: '', email: '', telefone: '',
    cargo: '', departamento: '', area: '', regime: 'clt', tipo: 'loja', data_admissao: '',
    salario_bruto: '', salario_liquido: '', banco: '', agencia: '', conta: '', pix: '',
    jornada_semanal_horas: '44', jornada_diaria_horas: '8', home_office_autorizado: false,
    endereco_residencial: '', unidade_id: unidadeSugerida,
  })

  const set = (k: keyof ColaboradorInput, v: string | boolean) => {
    setF((p) => ({ ...p, [k]: v }))
    setPrecisaForcar(false); setAviso('')
  }
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }

  const unidadeFixa = !isAdmin && !!activeUnitId

  function fechar() {
    setOpen(false); setErr(''); setAviso(''); setPrecisaForcar(false); setSecProf(false)
  }

  /** validação client-side (espelha o servidor) */
  function validar(): string | null {
    const nome = (f.nome || '').trim()
    if (!nome) return 'Informe o nome do colaborador.'
    if (nome.length < 2) return 'Nome muito curto.'
    const cpf = (f.cpf || '').replace(/\D/g, '')
    if (!cpf) return 'CPF é obrigatório.'
    if (cpf.length !== 11) return 'CPF deve ter 11 dígitos.'
    const email = (f.email || '').trim()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'E-mail inválido.'
    const tel = (f.telefone || '').replace(/\D/g, '')
    if (tel && (tel.length < 10 || tel.length > 13)) return 'Telefone inválido (DDD + número).'
    if (!f.unidade_id) return 'Selecione a unidade de lotação.'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setAviso('')
    const v = validar()
    if (v) { setErr(v); return }
    setSaving(true)

    if (!precisaForcar) {
      const dup = await checarCpfDuplicado(f.cpf, f.unidade_id ?? null)
      if (dup.ok && dup.duplicado) {
        setAviso(`Já existe colaborador com este CPF: "${dup.duplicado.nome}". Clique em "Cadastrar mesmo assim" para confirmar.`)
        setPrecisaForcar(true); setSaving(false); return
      }
      if (!dup.ok) { setErr(dup.error); setSaving(false); return }
    }

    const res = await criarColaborador(f, precisaForcar)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao cadastrar colaborador.'); return }
    fechar()
    if (res.id) router.push(`/colaboradores/${res.id}`)
    else router.refresh()
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><i className="ti ti-user-plus" /> Novo colaborador</button>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={fechar}
        >
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 600, padding: 22, background: '#fff', borderRadius: 14, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
            <h3 style={{ fontSize: 18, marginBottom: 14, fontWeight: 700 }}>Novo colaborador</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Nome <span style={{ color: 'var(--red)' }}>*</span></label><input style={inp} value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></div>
              <div><label style={lbl}>CPF <span style={{ color: 'var(--red)' }}>*</span></label><input style={inp} value={f.cpf} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" inputMode="numeric" /></div>
              <div><label style={lbl}>RG</label><input style={inp} value={f.rg} onChange={(e) => set('rg', e.target.value)} /></div>
              <div><label style={lbl}>Telefone</label><input style={inp} value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(00) 90000-0000" inputMode="tel" /></div>
              <div><label style={lbl}>Nascimento</label><input style={inp} type="date" value={f.data_nascimento} onChange={(e) => set('data_nascimento', e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>E-mail</label><input style={inp} value={f.email} onChange={(e) => set('email', e.target.value)} /></div>

              <div><label style={lbl}>Cargo</label>
                <select style={inp} value={f.cargo} onChange={(e) => set('cargo', e.target.value)}>
                  <option value="">Selecione...</option>
                  {Object.entries(CARGO_LABELS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Regime</label>
                <select style={inp} value={f.regime} onChange={(e) => set('regime', e.target.value)}>
                  {Object.entries(REGIME_LABELS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Tipo</label>
                <select style={inp} value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
                  {Object.entries(TIPO_LABELS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Admissão</label><input style={inp} type="date" value={f.data_admissao} onChange={(e) => set('data_admissao', e.target.value)} /></div>
              <div><label style={lbl}>Área</label><input style={inp} value={f.area} onChange={(e) => set('area', e.target.value)} placeholder="Ex.: Loja, IA" /></div>
              <div><label style={lbl}>Departamento</label><input style={inp} value={f.departamento} onChange={(e) => set('departamento', e.target.value)} /></div>

              {!unidadeFixa && (
                <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Unidade de lotação <span style={{ color: 'var(--red)' }}>*</span></label>
                  <select style={inp} value={f.unidade_id ?? ''} onChange={(e) => set('unidade_id', e.target.value)}>
                    <option value="">— Selecione —</option>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Bloco profissional / RH (recolhível) */}
            <button type="button" onClick={() => setSecProf((s) => !s)} style={{ marginTop: 16, marginBottom: 4, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--brand-500)', padding: 0 }}>
              <i className={`ti ${secProf ? 'ti-chevron-down' : 'ti-chevron-right'}`} /> Bloco profissional &amp; RH (opcional)
            </button>
            {secProf && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <div><label style={lbl}>Salário bruto (R$)</label><input style={inp} value={f.salario_bruto} onChange={(e) => set('salario_bruto', e.target.value)} placeholder="0,00" inputMode="decimal" /></div>
                <div><label style={lbl}>Salário líquido (R$)</label><input style={inp} value={f.salario_liquido} onChange={(e) => set('salario_liquido', e.target.value)} placeholder="0,00" inputMode="decimal" /></div>
                <div><label style={lbl}>Jornada semanal (h)</label><input style={inp} value={f.jornada_semanal_horas} onChange={(e) => set('jornada_semanal_horas', e.target.value)} inputMode="numeric" /></div>
                <div><label style={lbl}>Jornada diária (h)</label><input style={inp} value={f.jornada_diaria_horas} onChange={(e) => set('jornada_diaria_horas', e.target.value)} inputMode="numeric" /></div>
                <div><label style={lbl}>Banco</label><input style={inp} value={f.banco} onChange={(e) => set('banco', e.target.value)} /></div>
                <div><label style={lbl}>Pix</label><input style={inp} value={f.pix} onChange={(e) => set('pix', e.target.value)} /></div>
                <div><label style={lbl}>Agência</label><input style={inp} value={f.agencia} onChange={(e) => set('agencia', e.target.value)} /></div>
                <div><label style={lbl}>Conta</label><input style={inp} value={f.conta} onChange={(e) => set('conta', e.target.value)} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Endereço residencial</label><input style={inp} value={f.endereco_residencial} onChange={(e) => set('endereco_residencial', e.target.value)} /></div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="ho-novo" checked={!!f.home_office_autorizado} onChange={(e) => set('home_office_autorizado', e.target.checked)} />
                  <label htmlFor="ho-novo" style={{ ...lbl, cursor: 'pointer' }}>Home office autorizado</label>
                </div>
                {/* TODO(legado: buildServicosExecutados): "Serviços que o colaborador executa"
                    + % comissão padrão — tabela de junção colaborador_servicos não existe no schema lkii. */}
              </div>
            )}

            {aviso && <p style={{ color: '#9A6700', background: '#FBEFD9', borderRadius: 8, padding: '8px 11px', fontSize: 12.5, marginTop: 12 }}><i className="ti ti-alert-triangle" /> {aviso}</p>}
            {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn" onClick={fechar}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : precisaForcar ? 'Cadastrar mesmo assim' : 'Cadastrar colaborador'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
