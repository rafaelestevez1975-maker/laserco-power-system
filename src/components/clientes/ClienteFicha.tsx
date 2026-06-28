'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moedaBR, dataBR, dataHoraBR, waHref, telBR55 } from '@/lib/fmt'
import { salvarCliente, inativarCliente, reativarCliente } from '@/app/(app)/clientes/actions'
import { UnificarClienteModal } from '@/components/clientes/UnificarClienteModal'

export type ClienteFull = {
  id: string
  nome: string | null
  telefone: string | null
  email: string | null
  cpf: string | null
  rg: string | null
  data_nascimento: string | null
  genero: string | null
  canal_origem: string | null
  observacoes: string | null
  cep: string | null
  rua: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  saldo_pontos: number | null
  saldo_creditos: number | null
  ativo: boolean | null
  verificado: boolean | null
  unidade_origem_id: string | null
  criado_em: string | null
}

export type AgendamentoRow = {
  id: string
  inicio: string | null
  status: string | null
  servico: string | null
  unidade: string | null
  profissional: string | null
}

export type OSRow = {
  id: string
  numero: number | null
  status: string | null
  origem: string | null
  total: number | null
  observacao: string | null
  criado_em: string | null
  fechada_em: string | null
}

export type ContratoRow = {
  id: string
  plano: string | null
  status: string | null
  valor_mensal: number | null
  criado_em: string | null
  assinado_em: string | null
}

type Tab = 'dados' | 'agendamentos' | 'carteira' | 'os' | 'contratos' | 'acompanhamento'

const GENEROS: [string, string][] = [['', '—'], ['female', 'Feminino'], ['male', 'Masculino'], ['other', 'Outro']]

const CANAIS = [
  'Indicação de amigo', 'Instagram', 'Facebook', 'Google / Busca', 'Site da rede',
  'Landing Page', 'WhatsApp', 'Passei em frente à loja', 'Outro',
]

function statusPill(s: string | null): React.CSSProperties {
  const base: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20, display: 'inline-block' }
  if (s === 'concluido' || s === 'fechada') return { ...base, background: '#E7F0EC', color: '#15803D' }
  if (s === 'cancelado' || s === 'cancelada') return { ...base, background: '#FBE9EB', color: '#D85563' }
  if (s === 'confirmado') return { ...base, background: '#E7EEF7', color: '#1E5BA6' }
  return { ...base, background: '#FBEFD9', color: '#9A6700' }
}

// ── Mapeamento status do contrato → label + classe CSS (espelha relatorios/contratos) ──
const CONTRATO_STATUS: Record<string, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'os-fechada' },
  encerrado: { label: 'Encerrado', cls: 'os-aberta' },
  cancelado: { label: 'Cancelado', cls: 'os-cancelada' },
  inadimplente: { label: 'Inadimplente', cls: 'os-cancelada' },
}
function contratoStatusMeta(s: string | null): { label: string; cls: string } {
  return (s && CONTRATO_STATUS[s]) || { label: s || '—', cls: 'os-aberta' }
}

export function ClienteFicha({
  cliente, agendamentos, agendamentosTotal, ordens, ordensTotal, contratos, duplicados, unidadeOrigemNome, podeEscrever,
}: {
  cliente: ClienteFull
  agendamentos: AgendamentoRow[]
  agendamentosTotal: number
  ordens: OSRow[]
  ordensTotal: number
  contratos: ContratoRow[]
  duplicados: number
  unidadeOrigemNome: string | null
  podeEscrever: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('dados')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [fotos, setFotos] = useState<{ src: string; cap: string }[]>([])
  const [unificarOpen, setUnificarOpen] = useState(false)

  const [f, setF] = useState({
    nome: cliente.nome ?? '',
    telefone: cliente.telefone ?? '',
    email: cliente.email ?? '',
    cpf: cliente.cpf ?? '',
    rg: cliente.rg ?? '',
    genero: cliente.genero ?? '',
    data_nascimento: cliente.data_nascimento ?? '',
    canal_origem: cliente.canal_origem ?? '',
    cep: cliente.cep ?? '',
    rua: cliente.rua ?? '',
    numero: cliente.numero ?? '',
    complemento: cliente.complemento ?? '',
    bairro: cliente.bairro ?? '',
    cidade: cliente.cidade ?? '',
    estado: cliente.estado ?? '',
    observacoes: cliente.observacoes ?? '',
    verificado: !!cliente.verificado,
  })
  const set = (k: keyof typeof f, v: string | boolean) => { setF((p) => ({ ...p, [k]: v })); setMsg(''); setErr('') }

  const iniciais = (cliente.nome ?? '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  const wa = waHref(cliente.telefone)
  const codigo = '#' + cliente.id.replace(/-/g, '').slice(0, 6).toUpperCase()

  async function salvar() {
    setSaving(true); setMsg(''); setErr('')
    const res = await salvarCliente(cliente.id, f)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    setMsg('Cliente salvo.'); router.refresh()
  }

  async function toggleAtivo() {
    setBusy(true); setMsg(''); setErr('')
    const res = cliente.ativo === false ? await reativarCliente(cliente.id) : await inativarCliente(cliente.id)
    setBusy(false)
    if (!res.ok) { setErr(res.error || 'Erro.'); return }
    setMsg(cliente.ativo === false ? 'Cliente reativado.' : 'Cliente inativado.'); router.refresh()
  }

  // ── Ações inline e-mail / WhatsApp (legado fichaEmail/fichaWhats, 3136-3137) ──
  function abrirEmail() {
    const e = (f.email || '').trim()
    if (!/@/.test(e)) { setErr('E-mail inválido.'); return }
    const primeiro = (f.nome || '').split(' ')[0]
    const body = `Olá ${primeiro},%0D%0A%0D%0AAqui é da Laser&Co. `
    window.location.href = `mailto:${encodeURIComponent(e)}?subject=${encodeURIComponent('Laser&Co — Contato')}&body=${body}`
  }
  function abrirWhats() {
    const full = telBR55(f.telefone)
    if (full.length < 12) { setErr('Telefone incompleto para WhatsApp.'); return }
    const primeiro = (f.nome || '').split(' ')[0]
    window.open(`https://wa.me/${full}?text=${encodeURIComponent('Olá ' + primeiro + ', aqui é da Laser&Co 💜')}`, '_blank')
  }

  // ── Registro fotográfico (legado addFoto/uploadFoto, 3188-3202) ──
  function onFotoFile(file: File) {
    const r = new FileReader()
    r.onload = (ev) => {
      const n = new Date()
      const cap = `${String(n.getDate()).padStart(2, '0')}/${String(n.getMonth() + 1).padStart(2, '0')} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
      setFotos((p) => [{ src: String(ev.target?.result || ''), cap }, ...p])
    }
    r.readAsDataURL(file)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', outline: 'none', background: 'var(--surface)' }
  const lbl: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }
  const iconBtn: React.CSSProperties = { padding: '0 11px', border: '1px solid var(--line-strong)', borderRadius: 8, background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--brand-500)' }

  const tabs: [Tab, string, string][] = [
    ['dados', 'ti-user', 'Dados básicos'],
    ['agendamentos', 'ti-calendar', `Agendamentos${agendamentosTotal ? ` (${agendamentosTotal})` : ''}`],
    ['carteira', 'ti-wallet', 'Carteira'],
    ['acompanhamento', 'ti-clipboard-heart', 'Acompanhamento'],
    ['os', 'ti-clipboard-list', `Ordens de Serviço${ordensTotal ? ` (${ordensTotal})` : ''}`],
    ['contratos', 'ti-file-description', 'Contratos'],
  ]

  const saldoCashback = Math.max(0, Math.round(cliente.saldo_creditos ?? 0))
  const contratosViaOS = ordens.filter((o) => o.status === 'fechada')
  // Assinatura ativa = contrato com status 'ativo' (mais recente). Sem isso → estado honesto.
  const assinaturaAtiva = contratos.find((c) => c.status === 'ativo') ?? null

  return (
    <>
      <div className="ficha-head" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div className="ficha-avatar" style={{ width: 54, height: 54, borderRadius: '50%', background: 'linear-gradient(135deg,var(--brand-400),var(--brand-500))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>{iniciais}</div>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700 }}>{cliente.nome || '(sem nome)'}</h2>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {codigo}
            {cliente.criado_em ? ` · cliente desde ${dataBR(cliente.criado_em)}` : ''}
            {unidadeOrigemNome ? ` · ${unidadeOrigemNome}` : ''}
          </span>
          {cliente.ativo === false && <span className="os-st os-cancelada" style={{ marginLeft: 6 }}>Inativo</span>}
          {wa && <a href={wa} target="_blank" rel="noopener" className="wa-link" title="WhatsApp"><i className="ti ti-brand-whatsapp wa" /></a>}
        </div>
      </div>

      {/* Badge de duplicidade (legado fichaDup, 3038/3052) */}
      {duplicados >= 2 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FBEFD9', color: '#9A6700', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" /> Possível cliente duplicado · {duplicados} cadastros
          {podeEscrever && (
            <span onClick={() => setUnificarOpen(true)} style={{ textDecoration: 'underline', cursor: 'pointer' }}>Sugerir unificação</span>
          )}
        </div>
      )}

      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 10 }}><i className="ti ti-check" /> {msg}</div>}
      {err && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 10 }}>{err}</div>}

      {/* Tabs */}
      <div className="tabs" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)', marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(([t, icon, label]) => (
          <button
            key={t}
            className={`tab-btn${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
            style={{ padding: '12px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: 'none', border: 0, borderBottom: `2px solid ${tab === t ? 'var(--brand-500)' : 'transparent'}`, color: tab === t ? 'var(--brand-500)' : 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <i className={`ti ${icon}`} /> {label}
          </button>
        ))}
      </div>

      {/* ── Dados básicos ── */}
      {tab === 'dados' && (
        <div className="doc-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, padding: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, cursor: podeEscrever ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={f.verificado} disabled={!podeEscrever} onChange={(e) => set('verificado', e.target.checked)} />
            <span><b>Verificado</b> — cliente com dados confirmados.</span>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Nome</label><input style={inp} value={f.nome} disabled={!podeEscrever} onChange={(e) => set('nome', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>E-mail</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={inp} value={f.email} disabled={!podeEscrever} onChange={(e) => set('email', e.target.value)} />
                <button type="button" style={iconBtn} onClick={abrirEmail} title="Enviar e-mail ao cliente"><i className="ti ti-mail" /></button>
              </div>
            </div>
            <div><label style={lbl}>Telefone</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={inp} value={f.telefone} disabled={!podeEscrever} onChange={(e) => set('telefone', e.target.value)} />
                <button type="button" style={iconBtn} onClick={abrirWhats} title="Abrir WhatsApp do cliente"><i className="ti ti-brand-whatsapp" /></button>
              </div>
            </div>
            <div><label style={lbl}>Data de nascimento</label><input style={inp} type="date" value={f.data_nascimento || ''} disabled={!podeEscrever} onChange={(e) => set('data_nascimento', e.target.value)} /></div>
            <div><label style={lbl}>Gênero</label>
              <select style={inp} value={f.genero} disabled={!podeEscrever} onChange={(e) => set('genero', e.target.value)}>
                {GENEROS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Como nos conheceu?</label>
              <select style={inp} value={f.canal_origem} disabled={!podeEscrever} onChange={(e) => set('canal_origem', e.target.value)}>
                <option value="">—</option>
                {CANAIS.map((o) => <option key={o} value={o}>{o}</option>)}
                {f.canal_origem && !CANAIS.includes(f.canal_origem) && <option value={f.canal_origem}>{f.canal_origem}</option>}
              </select>
            </div>
            <div><label style={lbl}>CPF</label><input style={inp} value={f.cpf} disabled={!podeEscrever} onChange={(e) => set('cpf', e.target.value)} /></div>
            <div><label style={lbl}>RG</label><input style={inp} value={f.rg} disabled={!podeEscrever} onChange={(e) => set('rg', e.target.value)} /></div>

            {/* Endereço editável */}
            <div><label style={lbl}>CEP</label><input style={inp} value={f.cep} disabled={!podeEscrever} onChange={(e) => set('cep', e.target.value)} /></div>
            <div><label style={lbl}>Rua</label><input style={inp} value={f.rua} disabled={!podeEscrever} onChange={(e) => set('rua', e.target.value)} /></div>
            <div><label style={lbl}>Número</label><input style={inp} value={f.numero} disabled={!podeEscrever} onChange={(e) => set('numero', e.target.value)} /></div>
            <div><label style={lbl}>Complemento</label><input style={inp} value={f.complemento} disabled={!podeEscrever} onChange={(e) => set('complemento', e.target.value)} /></div>
            <div><label style={lbl}>Bairro</label><input style={inp} value={f.bairro} disabled={!podeEscrever} onChange={(e) => set('bairro', e.target.value)} /></div>
            <div><label style={lbl}>Cidade</label><input style={inp} value={f.cidade} disabled={!podeEscrever} onChange={(e) => set('cidade', e.target.value)} /></div>
            <div><label style={lbl}>Estado</label><input style={inp} value={f.estado} disabled={!podeEscrever} onChange={(e) => set('estado', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={f.observacoes} disabled={!podeEscrever} onChange={(e) => set('observacoes', e.target.value)} /></div>
          </div>

          {podeEscrever && (
            <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={salvar} disabled={saving}><i className="ti ti-device-floppy" /> {saving ? 'Salvando…' : 'Salvar cliente'}</button>
              {duplicados >= 2 && <button className="btn" onClick={() => setUnificarOpen(true)}><i className="ti ti-users-group" /> Unificar</button>}
              <button className="btn" disabled title="Gestão de bloqueios — em breve"><i className="ti ti-lock" /> Bloqueios</button>
              <button className="btn" disabled title="App da rede — em breve"><i className="ti ti-device-mobile" /> App</button>
              <button
                className="btn"
                onClick={toggleAtivo}
                disabled={busy}
                style={{ marginLeft: 'auto', color: cliente.ativo === false ? 'var(--green)' : 'var(--red)', borderColor: cliente.ativo === false ? '#B7E7C5' : '#E7B7BC' }}
              >
                <i className={`ti ${cliente.ativo === false ? 'ti-user-check' : 'ti-ban'}`} /> {busy ? '…' : cliente.ativo === false ? 'Reativar' : 'Inativar'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Agendamentos ── */}
      {tab === 'agendamentos' && (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead><tr><th>Data / hora</th><th>Serviço</th><th>Profissional</th><th>Unidade</th><th>Status</th></tr></thead>
              <tbody>
                {agendamentos.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>Este cliente ainda não tem agendamentos.</td></tr>
                )}
                {agendamentos.map((a) => (
                  <tr key={a.id} style={{ cursor: 'default' }}>
                    <td>{dataHoraBR(a.inicio)}</td>
                    <td>{a.servico || <span className="muted">—</span>}</td>
                    <td>{a.profissional || <span className="muted">—</span>}</td>
                    <td>{a.unidade || <span className="muted">—</span>}</td>
                    <td><span style={statusPill(a.status)}>{a.status || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {agendamentos.length > 0 && (
            <div className="cli-foot" style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--text-2)' }}>
              {agendamentosTotal} agendamento(s){agendamentosTotal > agendamentos.length ? ` (mostrando ${agendamentos.length})` : ''} · {agendamentos.filter((a) => a.status === 'concluido').length} concluído(s){agendamentosTotal > agendamentos.length ? '+' : ''} · {agendamentos.filter((a) => a.status === 'cancelado').length} cancelado(s){agendamentosTotal > agendamentos.length ? '+' : ''}
            </div>
          )}
        </div>
      )}

      {/* ── Carteira: cards + regras + extrato de cashback ── */}
      {tab === 'carteira' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="carteira-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
            <div className="fid-card" style={{ background: 'linear-gradient(135deg,var(--brand-500),var(--brand-600))', color: '#fff', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 12.5, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 7 }}><i className="ti ti-award" /> Clube de fidelidade</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{(cliente.saldo_pontos ?? 0).toLocaleString('pt-BR')} <span style={{ fontSize: 15 }}>pts</span></div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>R$ 1 gasto = 1 ponto</div>
            </div>
            <div className="cart-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Saldo de cashback</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{moedaBR(saldoCashback)}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>Crédito disponível na rede</div>
            </div>
            <div className="cart-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Plano de assinatura</div>
              {assinaturaAtiva
                ? (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {assinaturaAtiva.plano || 'Plano'} <span className={`os-st ${contratoStatusMeta(assinaturaAtiva.status).cls}`}>{contratoStatusMeta(assinaturaAtiva.status).label}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>{moedaBR(assinaturaAtiva.valor_mensal)}/mês</div>
                  </>
                )
                : (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6, color: 'var(--text-3)' }}>Sem assinatura ativa</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>Este cliente não tem plano de assinatura ativo.</div>
                  </>
                )}
            </div>
          </div>

          {/* Regras (legado box de regras, view 1457-1494) */}
          <div className="rel-card" style={{ padding: 16, fontSize: 12.5, color: 'var(--text-2)' }}>
            <b style={{ display: 'block', marginBottom: 6, color: 'var(--text)' }}><i className="ti ti-info-circle" /> Como funcionam pontos e cashback</b>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li><b>Fidelidade:</b> R$ 1 gasto = 1 ponto · validade de 12 meses · Indique &amp; Ganhe: +50 pts por indicação.</li>
              <li><b>Cashback por plano:</b> Bronze 3% · Prata 5% · Ouro 8% · validade de 30 dias · uso na própria rede.</li>
            </ul>
          </div>

          {/* Extrato de cashback — só temos o saldo atual (sem tabela de movimentação). */}
          <div className="doc-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, padding: 18 }}>
            <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 8 }}><i className="ti ti-cash" /> Extrato de cashback</h3>
            {saldoCashback === 0
              ? <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 6 }}>Sem cashback acumulado.</div>
              : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    Saldo atual de cashback: <b>{moedaBR(saldoCashback)}</b>.
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
                    O detalhamento por lançamento (acúmulo, uso e validade) ainda não está disponível — exibimos apenas o saldo consolidado.
                  </div>
                </>
              )}
          </div>
        </div>
      )}

      {/* ── Acompanhamento: documentos/termos + registro fotográfico ── */}
      {tab === 'acompanhamento' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="doc-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, padding: 18 }}>
            <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}><i className="ti ti-file-stack" /> Documentos e termos</h3>
            <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 6 }}>
              Ainda não há documentos ou termos preenchidos por este cliente. Os preenchimentos de anamnese e assinaturas aparecerão aqui quando registrados.
            </div>
          </div>

          <div className="doc-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, padding: 18 }}>
            <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}><i className="ti ti-camera" /> Registro fotográfico da sessão</h3>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                <i className="ti ti-camera" /> Tirar foto (abrir câmera)
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) onFotoFile(file); e.currentTarget.value = '' }} />
              </label>
              <label className="btn" style={{ cursor: 'pointer' }}>
                <i className="ti ti-upload" /> Enviar imagem
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) onFotoFile(file); e.currentTarget.value = '' }} />
              </label>
            </div>
            {fotos.length === 0
              ? <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 6 }}>Nenhuma foto registrada nesta sessão ainda.</div>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
                  {fotos.map((ft, i) => (
                    <div key={i} style={{ position: 'relative', borderRadius: 9, overflow: 'hidden', border: '1px solid var(--line)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ft.src} alt="Foto da sessão" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                      <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11, padding: '3px 6px' }}>{ft.cap}</span>
                    </div>
                  ))}
                </div>
              )}
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>As fotos ficam apenas nesta sessão do navegador (não persistem no servidor ainda).</div>
          </div>
        </div>
      )}

      {/* ── Ordens de Serviço ── */}
      {tab === 'os' && (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead><tr><th>Comanda</th><th>Descrição</th><th>Origem</th><th>Status</th><th>Data</th><th className="num-r">Total</th></tr></thead>
              <tbody>
                {ordens.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>Este cliente ainda não tem ordens de serviço.</td></tr>
                )}
                {ordens.map((o) => (
                  <tr key={o.id} style={{ cursor: 'default' }}>
                    <td>{o.numero != null ? `#${o.numero}` : <span className="muted">—</span>}</td>
                    <td>{o.observacao || <span className="muted">—</span>}</td>
                    <td>{o.origem || <span className="muted">—</span>}</td>
                    <td><span style={statusPill(o.status)}>{o.status || '—'}</span></td>
                    <td>{dataHoraBR(o.criado_em)}</td>
                    <td className="num-r">{moedaBR(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ordens.length > 0 && (
            <div className="cli-foot" style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--text-2)' }}>
              {ordensTotal} OS{ordensTotal > ordens.length ? ` (mostrando ${ordens.length})` : ''} · {ordens.filter((o) => o.status === 'fechada').length} fechada(s){ordensTotal > ordens.length ? '+' : ''} · {ordens.filter((o) => o.status === 'cancelada').length} cancelada(s){ordensTotal > ordens.length ? '+' : ''}
            </div>
          )}
        </div>
      )}

      {/* ── Contratos ── */}
      {tab === 'contratos' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="doc-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, padding: 18 }}>
            <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}><i className="ti ti-file-description" /> Contratos do cliente</h3>
            {contratos.length === 0
              ? <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 6 }}>Este cliente ainda não tem contratos/assinatura registrados.</div>
              : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {contratos.map((c) => {
                    const meta = contratoStatusMeta(c.status)
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
                        <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--brand-500)' }}><i className="ti ti-crown" /></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.plano || 'Contrato'}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {moedaBR(c.valor_mensal)}/mês{c.assinado_em ? ` · assinado em ${dataBR(c.assinado_em)}` : (c.criado_em ? ` · criado em ${dataBR(c.criado_em)}` : '')}
                          </div>
                        </div>
                        <span className={`os-st ${meta.cls}`}>{meta.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
          </div>

          <div className="doc-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, padding: 18 }}>
            <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}><i className="ti ti-clipboard-list" /> Contratos emitidos via OS</h3>
            {contratosViaOS.length === 0
              ? <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 6 }}>Nenhum contrato emitido para este cliente ainda. Eles aparecem aqui automaticamente quando uma OS de venda gera o contrato.</div>
              : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {contratosViaOS.map((o) => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
                      <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--brand-500)' }}><i className="ti ti-file-description" /></span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>OS {o.numero != null ? `#${o.numero}` : ''} · {o.observacao || 'Venda'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Fechada em {dataBR(o.fechada_em || o.criado_em)} · {moedaBR(o.total)}</div>
                      </div>
                      <span className="os-st os-fechada">Assinado</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}

      {unificarOpen && (
        <UnificarClienteModal clienteId={cliente.id} onClose={() => setUnificarOpen(false)} />
      )}
    </>
  )
}
