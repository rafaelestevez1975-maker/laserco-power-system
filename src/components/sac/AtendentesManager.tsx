'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { distribuirFila, criarAcessoAtendente } from '@/app/(app)/sac/atendentes/actions'

export type AtendenteRow = {
  id: string; nome: string; papel: string; cargo: string | null; area: string | null
  unidadeNome: string | null; email: string | null; ativo: boolean; conversas: number; tickets: number
}
export type UnidadeOpt = { id: string; nome: string }

const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color })

/** Gera uma senha provisória forte (só letras/números — evita & # que se corrompem ao copiar). */
function gerarSenha(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ', num = '23456789', min = 'abcdefghijkmnpqrstuvwxyz'
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  const base = [pick(abc), pick(abc), pick(min), pick(min), pick(min), pick(num), pick(num)]
  for (let i = base.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[base[i], base[j]] = [base[j], base[i]] }
  return 'Laser' + base.join('') // ex.: LaserKMabc23 (>= 12 chars, só letras/números)
}

export function AtendentesManager({ atendentes, filaConversas, filaTickets, podeDistribuir, podeCriar = false, unidades = [] }: {
  atendentes: AtendenteRow[]; filaConversas: number; filaTickets: number; podeDistribuir: boolean
  podeCriar?: boolean; unidades?: UnidadeOpt[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [novo, setNovo] = useState(false)

  async function distribuir() {
    setBusy(true); setMsg('')
    const r = await distribuirFila()
    setBusy(false)
    if (!r.ok) { setMsg(r.error || 'Erro ao distribuir.'); return }
    setMsg(`Distribuído: ${r.conversas} conversa(s) entre ${r.atendentes} atendente(s) por menor carga.`)
    router.refresh()
  }

  return (
    <>
      <div className="rel-acts" style={{ justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 14px', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          <i className="ti ti-inbox" /> Fila de atendimento: <b>{filaConversas}</b> conversa(s) aguardando humano · <b>{filaTickets}</b> chamado(s) sem atendente
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12.5, color: 'var(--brand-600)' }}>{msg}</span>}
          {podeCriar && (
            <button className="btn" onClick={() => setNovo(true)} title="Criar o login de uma nova atendente (acesso SAC)">
              <i className="ti ti-user-plus" /> Novo atendente
            </button>
          )}
          {podeDistribuir && (
            <button className="btn btn-primary" disabled={busy || filaConversas === 0} onClick={distribuir} title={filaConversas === 0 ? 'Sem conversas na fila' : 'Atribui as conversas em espera ao atendente de menor carga'}>
              {busy ? 'Distribuindo…' : <><i className="ti ti-arrows-shuffle" /> Distribuir conversas igualmente</>}
            </button>
          )}
        </div>
      </div>

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr><th>Atendente</th><th>Cargo (RH)</th><th>Papel</th><th>Unidade</th><th>Conversas</th><th>Chamados</th><th>Carga</th><th>Status</th></tr>
            </thead>
            <tbody>
              {atendentes.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum atendente SAC ativo. {podeCriar ? 'Use “Novo atendente” para criar o primeiro acesso.' : 'Cadastre colaboradores com papel SAC.'}</td></tr>
              )}
              {atendentes.map((a) => {
                const carga = a.conversas + a.tickets
                return (
                  <tr key={a.id}>
                    <td><b>{a.nome}</b>{a.email && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.email}</div>}</td>
                    <td>{a.cargo || <span style={{ color: 'var(--text-3)' }}>— sem ficha RH</span>}{a.area && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.area}</div>}</td>
                    <td><span style={pill('#EFE9F7', '#6b1f3a')}>{a.papel}</span></td>
                    <td>{a.unidadeNome || <span style={{ color: 'var(--text-3)' }}>Rede</span>}</td>
                    <td style={{ textAlign: 'center' }}>{a.conversas}</td>
                    <td style={{ textAlign: 'center' }}>{a.tickets}</td>
                    <td style={{ textAlign: 'center' }}><b style={{ color: carga === 0 ? 'var(--green)' : carga > 8 ? '#C2410C' : 'var(--brand-600)' }}>{carga}</b></td>
                    <td><span style={a.ativo ? pill('#E7F0EC', '#15803D') : pill('#FBE9EB', '#D85563')}>{a.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
        <i className="ti ti-info-circle" /> Atendente = colaborador com papel SAC (a mesma pessoa de Colaboradores / RH). A distribuição atribui a fila ao atendente de menor carga.
      </div>

      {novo && <NovoAtendenteModal unidades={unidades} onClose={() => setNovo(false)} onCriado={() => router.refresh()} />}
    </>
  )
}

function NovoAtendenteModal({ unidades, onClose, onCriado }: { unidades: UnidadeOpt[]; onClose: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState(gerarSenha())
  const [telefone, setTelefone] = useState('')
  const [unidadeId, setUnidadeId] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [criado, setCriado] = useState<{ email: string; senha: string; nome: string } | null>(null)

  async function salvar() {
    setErro(''); setSaving(true)
    const r = await criarAcessoAtendente({ nome, email, senha, telefone, unidadeId: unidadeId || null })
    setSaving(false)
    if (!r.ok) { setErro(r.error || 'Não foi possível criar o acesso.'); return }
    setCriado({ email: email.trim().toLowerCase(), senha, nome: nome.trim() })
    onCriado()
  }

  const copiar = () => { if (criado) navigator.clipboard?.writeText(`Acesso Laser&Co Power System\nLogin: ${criado.email}\nSenha: ${criado.senha}`).catch(() => {}) }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'block' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-1, #fff)', borderRadius: 14, width: 'min(480px, 100%)', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}><i className="ti ti-user-plus" /> Novo atendente (acesso SAC)</b>
          <button className="btn btn-icon" onClick={onClose} aria-label="Fechar"><i className="ti ti-x" /></button>
        </div>

        {criado ? (
          <div style={{ padding: 18 }}>
            <div style={{ background: '#E7F0EC', color: '#15803D', borderRadius: 10, padding: 12, fontSize: 13.5, marginBottom: 14 }}>
              <b><i className="ti ti-circle-check" /> Acesso de {criado.nome} criado.</b> Entregue as credenciais abaixo para a atendente. Ela já pode entrar.
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'monospace', lineHeight: 1.8 }}>
              <div><b>Login:</b> {criado.email}</div>
              <div><b>Senha:</b> {criado.senha}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={copiar}><i className="ti ti-copy" /> Copiar credenciais</button>
              <button className="btn btn-primary" onClick={onClose}>Concluir</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 18, display: 'grid', gap: 12 }}>
            <div>
              <label style={lbl}>Nome completo *</label>
              <input style={inp} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Silva" autoFocus />
            </div>
            <div>
              <label style={lbl}>E-mail de login *</label>
              <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@laserco.com.br" />
            </div>
            <div>
              <label style={lbl}>Senha provisória *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={inp} value={senha} onChange={(e) => setSenha(e.target.value)} />
                <button className="btn" type="button" onClick={() => setSenha(gerarSenha())} title="Gerar nova senha"><i className="ti ti-refresh" /></button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Mín. 8 caracteres. A atendente poderá trocar depois em “Minha conta”.</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Telefone</label>
                <input style={inp} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 90000-0000" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Unidade</label>
                <select style={inp} value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
                  <option value="">Rede (todas)</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
            </div>
            {erro && <div style={{ color: 'var(--danger, #D85563)', fontSize: 13 }}><i className="ti ti-alert-triangle" /> {erro}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 4, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Criando…' : <><i className="ti ti-check" /> Criar acesso</>}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
