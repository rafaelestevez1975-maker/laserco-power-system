'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarCliente, checarDuplicado, type NovoClienteInput } from '@/app/(app)/clientes/actions'

type Unidade = { id: string; nome: string }

const GENEROS: [string, string][] = [['', 'Selecione...'], ['female', 'Feminino'], ['male', 'Masculino'], ['other', 'Outro']]

// "Onde nos conheceu?"  9 opções do legado (cliModal, legacy 2724-2737).
const CANAIS = [
  'Indicação de amigo', 'Instagram', 'Facebook', 'Google / Busca', 'Site da rede',
  'Landing Page', 'WhatsApp', 'Passei em frente à loja', 'Outro',
]

export function NovoClienteModal({
  unidades, unidadeSugerida, isAdmin, activeUnitId,
}: { unidades: Unidade[]; unidadeSugerida: string | null; isAdmin: boolean; activeUnitId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState('') // aviso de duplicado (permite forçar)
  const [precisaForcar, setPrecisaForcar] = useState(false)
  const [f, setF] = useState<NovoClienteInput>({
    nome: '', telefone: '', email: '', cpf: '', genero: '', data_nascimento: '',
    canal_origem: '', cidade: '', estado: '', observacoes: '', unidade_origem_id: unidadeSugerida,
  })

  const set = (k: keyof NovoClienteInput, v: string) => {
    setF((p) => ({ ...p, [k]: v }))
    setPrecisaForcar(false); setAviso('') // editou algo → revalida dedup
  }
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }

  // A unidade só é escolhível por admin (vê todas). Operador de uma unidade usa a ativa.
  const unidadeFixa = !isAdmin && !!activeUnitId

  function fechar() {
    setOpen(false); setErr(''); setAviso(''); setPrecisaForcar(false)
  }

  /** validação client-side por campo (espelha o servidor) */
  function validar(): string | null {
    const nome = (f.nome || '').trim()
    if (!nome) return 'Informe o nome do cliente.'
    if (nome.length < 2) return 'Nome muito curto.'
    if (!(f.canal_origem || '').trim()) return 'Informe onde o cliente nos conheceu.'
    const email = (f.email || '').trim()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'E-mail inválido.'
    const cpf = (f.cpf || '').replace(/\D/g, '')
    if (cpf && cpf.length !== 11) return 'CPF deve ter 11 dígitos.'
    const tel = (f.telefone || '').replace(/\D/g, '')
    if (tel && (tel.length < 10 || tel.length > 13)) return 'Telefone inválido (DDD + número).'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setAviso('')
    const v = validar()
    if (v) { setErr(v); return }
    setSaving(true)

    // 1) dedup explícito (a não ser que o usuário já tenha confirmado forçar)
    if (!precisaForcar) {
      const dup = await checarDuplicado({ cpf: f.cpf, telefone: f.telefone, nome: f.nome, unidade_origem_id: f.unidade_origem_id })
      if (dup.ok && dup.duplicado) {
        const cpfInfo = (f.cpf || '').replace(/\D/g, '')
        // Legado (cliSalvarNovo, 3066-3067): dup de NOME sem CPF é BLOQUEIO, não permite forçar.
        if (dup.duplicado.criterio === 'nome' && cpfInfo.length !== 11) {
          setErr(`Já existe cliente com este nome ("${dup.duplicado.nome}"). Informe um documento (CPF) para distinguir  ou trata-se de duplicidade.`)
          setSaving(false)
          return
        }
        const rotulo = dup.duplicado.criterio === 'cpf' ? 'CPF' : dup.duplicado.criterio === 'telefone' ? 'telefone' : 'nome'
        setAviso(`Já existe cliente com o mesmo ${rotulo}: "${dup.duplicado.nome}". Clique em "Cadastrar mesmo assim" para confirmar.`)
        setPrecisaForcar(true)
        setSaving(false)
        return
      }
      if (!dup.ok) { setErr(dup.error); setSaving(false); return }
    }

    // 2) cria (forcar = true se o usuário confirmou)
    const res = await criarCliente(f, precisaForcar)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao cadastrar cliente.'); return }
    fechar()
    if (res.id) router.push(`/clientes/${res.id}`)
    else router.refresh()
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><i className="ti ti-plus" /> Novo cliente</button>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={fechar}
        >
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, padding: 22, background: '#fff', borderRadius: 14, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
            <h3 style={{ fontSize: 18, marginBottom: 12, fontWeight: 700 }}>Novo cliente</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontSize: 12, color: 'var(--text-2)', marginBottom: 14 }}>
              <i className="ti ti-info-circle" style={{ color: 'var(--brand-500)', marginTop: 1 }} />
              <span>Cadastros feitos pelo <b>site da rede</b>, <b>landing pages</b> ou <b>manualmente na loja</b> caem automaticamente nesta mesma lista. Campos com <span style={{ color: 'var(--red)' }}>*</span> são obrigatórios.</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Nome completo <span style={{ color: 'var(--red)' }}>*</span></label><input style={inp} value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></div>
              <div><label style={lbl}>CPF</label><input style={inp} value={f.cpf} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" inputMode="numeric" /></div>
              <div><label style={lbl}>Telefone</label><input style={inp} value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(00) 90000-0000" inputMode="tel" /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>E-mail</label><input style={inp} value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Onde nos conheceu? <span style={{ color: 'var(--red)' }}>*</span></label>
                <select style={inp} value={f.canal_origem ?? ''} onChange={(e) => set('canal_origem', e.target.value)}>
                  <option value="">Selecione...</option>
                  {CANAIS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Gênero</label>
                <select style={inp} value={f.genero} onChange={(e) => set('genero', e.target.value)}>
                  {GENEROS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Nascimento</label><input style={inp} type="date" value={f.data_nascimento} onChange={(e) => set('data_nascimento', e.target.value)} /></div>
              <div><label style={lbl}>Cidade</label><input style={inp} value={f.cidade} onChange={(e) => set('cidade', e.target.value)} /></div>
              <div><label style={lbl}>Estado</label><input style={inp} value={f.estado} onChange={(e) => set('estado', e.target.value)} /></div>
              {!unidadeFixa && (
                <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Unidade de origem</label>
                  <select style={inp} value={f.unidade_origem_id ?? ''} onChange={(e) => set('unidade_origem_id', e.target.value)}>
                    <option value=""> Sem unidade </option>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>
            </div>

            {aviso && <p style={{ color: '#9A6700', background: '#FBEFD9', borderRadius: 8, padding: '8px 11px', fontSize: 12.5, marginTop: 12 }}><i className="ti ti-alert-triangle" /> {aviso}</p>}
            {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn" onClick={fechar}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : precisaForcar ? 'Cadastrar mesmo assim' : 'Cadastrar cliente'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
