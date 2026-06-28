'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { distribuirFila, criarAcessoAtendente, setAtendenteAtivo } from '@/app/(app)/sac/atendentes/actions'

export type AtendenteRow = {
  id: string; nome: string; papel: string; cargo: string | null; area: string | null
  unidadeNome: string | null; email: string | null; ativo: boolean; conversas: number; tickets: number
  chamadosTotal: number; resolvidos: number; slaPct: number | null; premio: number
}
export type UnidadeOpt = { id: string; nome: string }

const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color })
const brl = (n: number) => `R$ ${Math.round(Number(n) || 0).toLocaleString('pt-BR')}`

/** Gera uma senha provisória forte com CSPRNG (crypto.getRandomValues; fallback p/ Math.random
 *  em ambientes sem WebCrypto). Só letras/números — evita & # que se corrompem ao copiar. */
function gerarSenha(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ', num = '23456789', min = 'abcdefghijkmnpqrstuvwxyz'
  const rnd = (n: number): number => {
    const c = typeof crypto !== 'undefined' ? crypto : undefined
    if (c?.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] % n }
    return Math.floor(Math.random() * n)
  }
  const pick = (s: string) => s[rnd(s.length)]
  const base = [pick(abc), pick(abc), pick(min), pick(min), pick(min), pick(num), pick(num)]
  for (let i = base.length - 1; i > 0; i--) { const j = rnd(i + 1);[base[i], base[j]] = [base[j], base[i]] }
  return 'Laser' + base.join('') // ex.: LaserKMabc23 (>= 12 chars, só letras/números)
}

export function AtendentesManager({ atendentes, filaConversas, filaTickets, podeDistribuir, podeCriar = false, unidades = [], escopo = 'Todas as unidades', comEscopo = false }: {
  atendentes: AtendenteRow[]; filaConversas: number; filaTickets: number; podeDistribuir: boolean
  podeCriar?: boolean; unidades?: UnidadeOpt[]; escopo?: string; comEscopo?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [novo, setNovo] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const temFila = filaConversas > 0 || filaTickets > 0
  const ativos = atendentes.filter((a) => a.ativo)

  async function distribuir() {
    setBusy(true); setMsg('')
    const r = await distribuirFila()
    setBusy(false)
    if (!r.ok) { setMsg(r.error || 'Erro ao distribuir.'); return }
    const partes = [
      (r.conversas ?? 0) > 0 ? `${r.conversas} conversa(s)` : '',
      (r.tickets ?? 0) > 0 ? `${r.tickets} chamado(s)` : '',
    ].filter(Boolean)
    setMsg(partes.length ? `Distribuído: ${partes.join(' e ')} entre ${r.atendentes} atendente(s) por menor carga.` : 'Nada na fila para distribuir.')
    router.refresh()
  }

  async function alternarAtivo(a: AtendenteRow) {
    setToggling(a.id); setMsg('')
    const r = await setAtendenteAtivo(a.id, !a.ativo)
    setToggling(null)
    if (!r.ok) { setMsg(r.error || 'Não foi possível alterar o status.'); return }
    setMsg(`${a.nome} ${a.ativo ? 'desativada' : 'reativada'}.`)
    router.refresh()
  }

  return (
    <>
      {/* Card de apresentação — paridade com o legado (rel-card, título + "Cadastrar no Colaboradores").
          Mantém as features novas: status da fila, "Novo atendente" e "Distribuir fila". */}
      <div className="rel-card" style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <b><i className="ti ti-users" style={{ color: 'var(--brand-500)' }} /> Atendentes do SAC</b>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, maxWidth: 620 }}>
            O cadastro de atendentes (com acessos, perfil e login) é feito no módulo <b>Colaboradores</b>. Aqui você acompanha a performance e a premiação.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>
            <i className="ti ti-inbox" /> Fila de atendimento{comEscopo ? <> · <b>{escopo}</b></> : <> · <b>toda a rede</b></>}: <b>{filaConversas}</b> conversa(s) aguardando humano · <b>{filaTickets}</b> chamado(s) sem atendente
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {msg && <span style={{ fontSize: 12.5, color: 'var(--brand-600)' }}>{msg}</span>}
          {podeCriar && (
            <button className="btn" onClick={() => setNovo(true)} title="Criar o login de uma nova atendente (acesso SAC)">
              <i className="ti ti-user-plus" /> Novo atendente
            </button>
          )}
          {podeDistribuir && (
            <button className="btn btn-primary" disabled={busy || !temFila} onClick={distribuir} title={!temFila ? 'Nada na fila para distribuir' : 'Atribui conversas e chamados em espera ao atendente de menor carga'}>
              {busy ? 'Distribuindo…' : <><i className="ti ti-arrows-shuffle" /> Distribuir fila igualmente</>}
            </button>
          )}
        </div>
      </div>

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Atendente</th><th>Cargo (RH)</th><th>Papel</th><th>Unidade</th>
                <th style={{ textAlign: 'center' }}>Conversas</th><th style={{ textAlign: 'center' }}>Em aberto</th>
                <th style={{ textAlign: 'center' }}>Carga</th><th style={{ textAlign: 'center' }}>Resolvidos</th>
                <th style={{ textAlign: 'center' }}>SLA</th><th style={{ textAlign: 'right' }}>Prêmio (mês)</th>
                <th>Status</th>{podeCriar && <th />}
              </tr>
            </thead>
            <tbody>
              {atendentes.length === 0 && (
                <tr><td colSpan={podeCriar ? 12 : 11} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum atendente SAC. {podeCriar ? 'Use “Novo atendente” para criar o primeiro acesso.' : 'Cadastre colaboradores com papel SAC.'}</td></tr>
              )}
              {atendentes.map((a) => {
                const carga = a.conversas + a.tickets
                const slaCor = a.slaPct == null ? 'var(--text-3)' : a.slaPct >= 90 ? '#15803D' : a.slaPct >= 70 ? '#B7791F' : '#C2410C'
                return (
                  <tr key={a.id} style={a.ativo ? undefined : { opacity: 0.6 }}>
                    <td><b>{a.nome}</b>{a.email && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.email}</div>}</td>
                    <td>{a.cargo || <span style={{ color: 'var(--text-3)' }}>— sem ficha RH</span>}{a.area && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.area}</div>}</td>
                    <td><span style={pill('#EFE9F7', '#6b1f3a')}>{a.papel}</span></td>
                    <td>{a.unidadeNome || <span style={{ color: 'var(--text-3)' }}>Rede</span>}</td>
                    <td style={{ textAlign: 'center' }}>{a.conversas}</td>
                    <td style={{ textAlign: 'center' }}>{a.tickets}</td>
                    <td style={{ textAlign: 'center' }}><b style={{ color: carga === 0 ? 'var(--green)' : carga > 8 ? '#C2410C' : 'var(--brand-600)' }}>{carga}</b></td>
                    <td style={{ textAlign: 'center' }}>{a.resolvidos}<span style={{ color: 'var(--text-3)', fontSize: 11 }}>/{a.chamadosTotal}</span></td>
                    <td style={{ textAlign: 'center', color: slaCor, fontWeight: a.slaPct != null ? 700 : 400 }}>{a.slaPct == null ? '—' : `${a.slaPct}%`}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: a.premio > 0 ? 'var(--brand-600)' : 'var(--text-3)' }}>{a.premio > 0 ? brl(a.premio) : '—'}</td>
                    <td><span style={a.ativo ? pill('#E7F0EC', '#15803D') : pill('#FBE9EB', '#D85563')}>{a.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    {podeCriar && (
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-icon" disabled={toggling === a.id} onClick={() => alternarAtivo(a)}
                          title={a.ativo ? 'Desativar (deixa de receber distribuição)' : 'Reativar atendente'}>
                          <i className={`ti ${toggling === a.id ? 'ti-loader' : a.ativo ? 'ti-user-off' : 'ti-user-check'}`} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Premiação por desempenho — paridade visual com o card do legado: rel-card fundo
          surface-2, ícone ouro ti-percentage e link à Matriz de Comissões. Mantém os atalhos
          novos (Ranking SAC, Colaboradores). */}
      <div className="rel-card" style={{ marginTop: 12, background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <i className="ti ti-percentage" style={{ color: 'var(--gold-500)', fontSize: 20 }} />
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            <b>Premiação por desempenho:</b> o perfil <b>Atendente</b> participa da <Link href="/cadastros/comissoes" style={{ color: 'var(--brand-500)', fontWeight: 700 }}>Matriz de Comissões</Link> com critérios de SAC (casos resolvidos, rapidez e SLA). Configure metas e prêmios por lá.
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              Prêmio estimado pelos KPIs reais (resolvidos, SLA, reversões). {ativos.length} atendente(s) ativo(s).
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" href="/sac/ranking" title="Ranking e regras de premiação do SAC"><i className="ti ti-medal" /> Ranking SAC</Link>
          <Link className="btn" href="/cadastros/comissoes" title="Matriz de comissões da rede"><i className="ti ti-table" /> Matriz de comissões</Link>
          <Link className="btn" href="/colaboradores" title="Cadastro de colaborador (RH) — fonte da ficha do atendente"><i className="ti ti-user-star" /> Cadastrar no Colaboradores</Link>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
        <i className="ti ti-info-circle" /> Atendente = colaborador com papel SAC (a mesma pessoa de Colaboradores / RH). A distribuição atribui a fila (conversas e chamados sem dono) ao atendente de menor carga. SLA% = casos no prazo ÷ total atendido.
        {podeDistribuir && !podeCriar && <> Gestor/SAC pode distribuir a fila; apenas o administrador cria, ativa ou desativa acessos.</>}
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
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              <i className="ti ti-info-circle" /> Para a ficha de RH completa (cargo, área, documentos), cadastre também em <b>Colaboradores</b> ligando ao mesmo e-mail.
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
