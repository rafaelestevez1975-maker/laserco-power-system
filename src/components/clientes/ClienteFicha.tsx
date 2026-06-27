'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moedaBR, dataBR, dataHoraBR, waHref } from '@/lib/fmt'
import { salvarCliente, inativarCliente, reativarCliente } from '@/app/(app)/clientes/actions'

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

type Tab = 'dados' | 'agendamentos' | 'carteira' | 'os' | 'contratos' | 'acompanhamento'

const GENEROS: [string, string][] = [['', '—'], ['female', 'Feminino'], ['male', 'Masculino'], ['other', 'Outro']]
const generoLabel = (g: string | null) => GENEROS.find(([v]) => v === g)?.[1] ?? (g || '—')

function statusPill(s: string | null): React.CSSProperties {
  const base: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20, display: 'inline-block' }
  if (s === 'concluido') return { ...base, background: '#E7F0EC', color: '#15803D' }
  if (s === 'cancelado') return { ...base, background: '#FBE9EB', color: '#D85563' }
  if (s === 'confirmado') return { ...base, background: '#E7EEF7', color: '#1E5BA6' }
  return { ...base, background: '#FBEFD9', color: '#9A6700' }
}

export function ClienteFicha({
  cliente, agendamentos, unidadeOrigemNome, podeEscrever,
}: { cliente: ClienteFull; agendamentos: AgendamentoRow[]; unidadeOrigemNome: string | null; podeEscrever: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('dados')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const [f, setF] = useState({
    nome: cliente.nome ?? '',
    telefone: cliente.telefone ?? '',
    email: cliente.email ?? '',
    cpf: cliente.cpf ?? '',
    genero: cliente.genero ?? '',
    data_nascimento: cliente.data_nascimento ?? '',
    cidade: cliente.cidade ?? '',
    estado: cliente.estado ?? '',
    observacoes: cliente.observacoes ?? '',
    verificado: !!cliente.verificado,
  })
  const set = (k: keyof typeof f, v: string | boolean) => { setF((p) => ({ ...p, [k]: v })); setMsg(''); setErr('') }

  const iniciais = (cliente.nome ?? '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  const wa = waHref(cliente.telefone)

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

  const inp: React.CSSProperties = { width: '100%', padding: '10px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', outline: 'none', background: 'var(--surface)' }
  const lbl: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }

  const tabs: [Tab, string, string][] = [
    ['dados', 'ti-user', 'Dados básicos'],
    ['agendamentos', 'ti-calendar', `Agendamentos${agendamentos.length ? ` (${agendamentos.length})` : ''}`],
    ['carteira', 'ti-wallet', 'Carteira'],
    ['acompanhamento', 'ti-clipboard-heart', 'Acompanhamento'],
    ['os', 'ti-clipboard-list', 'Ordens de Serviço'],
    ['contratos', 'ti-file-description', 'Contratos'],
  ]

  return (
    <>
      <div className="ficha-head" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div className="ficha-avatar" style={{ width: 54, height: 54, borderRadius: '50%', background: 'linear-gradient(135deg,var(--brand-400),var(--brand-500))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>{iniciais}</div>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700 }}>{cliente.nome || '(sem nome)'}</h2>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {cliente.criado_em ? `cliente desde ${dataBR(cliente.criado_em)}` : ''}
            {unidadeOrigemNome ? ` · ${unidadeOrigemNome}` : ''}
            {cliente.ativo === false ? ' · ' : ''}
          </span>
          {cliente.ativo === false && <span className="os-st os-cancelada" style={{ marginLeft: 6 }}>Inativo</span>}
          {wa && <a href={wa} target="_blank" rel="noopener" className="wa-link" title="WhatsApp"><i className="ti ti-brand-whatsapp wa" /></a>}
        </div>
      </div>

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
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>E-mail</label><input style={inp} value={f.email} disabled={!podeEscrever} onChange={(e) => set('email', e.target.value)} /></div>
            <div><label style={lbl}>Telefone</label><input style={inp} value={f.telefone} disabled={!podeEscrever} onChange={(e) => set('telefone', e.target.value)} /></div>
            <div><label style={lbl}>CPF</label><input style={inp} value={f.cpf} disabled={!podeEscrever} onChange={(e) => set('cpf', e.target.value)} /></div>
            <div><label style={lbl}>Data de nascimento</label><input style={inp} type="date" value={f.data_nascimento || ''} disabled={!podeEscrever} onChange={(e) => set('data_nascimento', e.target.value)} /></div>
            <div><label style={lbl}>Gênero</label>
              <select style={inp} value={f.genero} disabled={!podeEscrever} onChange={(e) => set('genero', e.target.value)}>
                {GENEROS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Cidade</label><input style={inp} value={f.cidade} disabled={!podeEscrever} onChange={(e) => set('cidade', e.target.value)} /></div>
            <div><label style={lbl}>Estado</label><input style={inp} value={f.estado} disabled={!podeEscrever} onChange={(e) => set('estado', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={f.observacoes} disabled={!podeEscrever} onChange={(e) => set('observacoes', e.target.value)} /></div>
          </div>

          {/* Endereço somente-leitura (legado tinha CEP/rua/número/bairro; mantemos visível) */}
          {(cliente.cep || cliente.rua || cliente.bairro) && (
            <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--text-2)' }}>
              <i className="ti ti-map-pin" /> {[cliente.rua, cliente.numero, cliente.complemento, cliente.bairro, cliente.cep].filter(Boolean).join(', ')}
            </div>
          )}
          {cliente.canal_origem && <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-3)' }}>Origem: {cliente.canal_origem}</div>}

          {podeEscrever && (
            <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={salvar} disabled={saving}><i className="ti ti-device-floppy" /> {saving ? 'Salvando…' : 'Salvar cliente'}</button>
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

      {/* ── Agendamentos (dados reais por cliente_id) ── */}
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
              {agendamentos.length} agendamento(s) · {agendamentos.filter((a) => a.status === 'concluido').length} concluído(s) · {agendamentos.filter((a) => a.status === 'cancelado').length} cancelado(s)
            </div>
          )}
        </div>
      )}

      {/* ── Carteira (saldo_pontos / saldo_creditos reais) ── */}
      {tab === 'carteira' && (
        <div className="carteira-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
          <div className="fid-card" style={{ background: 'linear-gradient(135deg,var(--brand-500),var(--brand-600))', color: '#fff', borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontSize: 12.5, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 7 }}><i className="ti ti-award" /> Clube de fidelidade</div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{(cliente.saldo_pontos ?? 0).toLocaleString('pt-BR')} <span style={{ fontSize: 15 }}>pts</span></div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>R$ 1 gasto = 1 ponto</div>
          </div>
          <div className="cart-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Créditos / cashback</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{moedaBR(cliente.saldo_creditos)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>Saldo disponível para usar na rede</div>
          </div>
        </div>
      )}

      {/* ── Abas ainda não migradas ── */}
      {tab === 'acompanhamento' && (
        <div className="rel-card" style={{ padding: 20, color: 'var(--text-2)' }}>
          {/* TODO(legado): Acompanhamento — documentos/termos + registro fotográfico da sessão (câmera/upload). buildClientes/openClienteFicha, legacy 3174-3232. */}
          <i className="ti ti-tools" /> Acompanhamento (documentos, termos e fotos da sessão) — em desenvolvimento.
        </div>
      )}
      {tab === 'os' && (
        <div className="rel-card" style={{ padding: 20, color: 'var(--text-2)' }}>
          {/* TODO(legado): Ordens de Serviço do cliente — depende do módulo de OS (buildOS/osRender, legacy 3363-3427). */}
          <i className="ti ti-tools" /> Ordens de Serviço do cliente — em desenvolvimento.
        </div>
      )}
      {tab === 'contratos' && (
        <div className="rel-card" style={{ padding: 20, color: 'var(--text-2)' }}>
          {/* TODO(legado): Contratos (prestação de serviços + Laser&Club) e assinatura digital. openClienteFicha/fichaContratosRender, legacy 1448-1455. */}
          <i className="ti ti-tools" /> Contratos do cliente — em desenvolvimento.
        </div>
      )}
    </>
  )
}
