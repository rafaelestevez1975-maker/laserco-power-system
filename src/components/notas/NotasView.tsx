'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { moedaBR } from '@/lib/fmt'
import {
  NFSE_POLITICAS, rotuloEmissao, badgeStatus, rotuloFato, rotuloTipo,
  type NfsePolitica,
} from '@/lib/nfse'
import {
  definirPolitica, definirPorSessao, salvarConfigUnidade, emitirManual, alterarStatusNota,
} from '@/app/(app)/notas/actions'

export type UnidadeFiscal = {
  id: string
  nome: string
  cidade: string
  uf: string
  provedor: string
  aliquota: number
  conectada: boolean
  ambiente: string
}

export type NotaRow = {
  id: string
  numero: string | null
  competencia: string | null
  tipo: string
  fato_gerador: string
  clienteNome: string | null
  valor: number
  status: string
}

type Cliente = { id: string; nome: string }

type Props = {
  semTabela: boolean
  podeAdministrar: boolean
  politica: NfsePolitica
  porSessao: boolean
  unidades: UnidadeFiscal[]
  conectadas: number
  notas: NotaRow[]
  listaTotal: number
  valorCapped: boolean
  kpis: { emitidas: number; valorTotal: number; canceladas: number; processando: number }
  clientes: Cliente[]
  activeUnitId: string | null
  activeUnitName: string
  filtros: { comp: string; unidade: string; tipo: string; status: string }
}

export function NotasView(props: Props) {
  const {
    semTabela, podeAdministrar, politica, porSessao, unidades, conectadas, notas,
    listaTotal, valorCapped, kpis, clientes, activeUnitId, activeUnitName, filtros,
  } = props
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [pending, start] = useTransition()
  const [emitirOpen, setEmitirOpen] = useState(false)
  const [cfgUnidade, setCfgUnidade] = useState<UnidadeFiscal | null>(null)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErro('')
    start(async () => {
      const r = await fn()
      if (!r.ok) setErro(r.error || 'Falha na operação.')
      else router.refresh()
    })
  }

  // Mensagem explicativa da política (legado buildNotas cfg).
  const polMsg =
    politica === 'nenhuma'
      ? { cls: 'warn-msg', icon: 'ti-alert-triangle', html: <>Emissão de NF <b>desativada</b> — nenhuma nota será gerada automaticamente.</> }
      : politica === 'venda'
        ? { cls: 'next', icon: 'ti-info-circle', html: <>A NFS-e é emitida no <b>ato da venda</b>, pelo valor total, na <b>prefeitura da unidade vendedora</b>.</> }
        : { cls: 'ok', icon: 'ti-check', html: <>A NFS-e é emitida a cada <b>sessão executada</b> (fato gerador), no valor por sessão, na <b>prefeitura da unidade executora</b>.</> }

  return (
    <div className="view active">
      {erro && <div className="sim-msg err" style={{ marginBottom: 12 }}><i className="ti ti-alert-triangle" /> {erro}</div>}

      {semTabela && (
        <div className="rel-card" style={{ textAlign: 'center', padding: '26px 18px', marginBottom: 16 }}>
          <i className="ti ti-database-off" style={{ fontSize: 28, color: 'var(--text-3)' }} />
          <p style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>Tabelas de NFS-e não encontradas</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
            Aplique a migration <code>scripts/migrations/nfse.sql</code> no lkii para habilitar política de emissão,
            integração com prefeituras e o registro de notas emitidas.
          </p>
        </div>
      )}

      {/* ── Política de emissão da rede ── */}
      <div className="rel-card">
        <div className="rel-card-h"><span><i className="ti ti-settings flt" /> Política de emissão da rede</span></div>
        <div className="seg" style={{ margin: '4px 0 12px' }}>
          {NFSE_POLITICAS.map((s) => (
            <button
              key={s.k}
              className={`seg-btn ${politica === s.k ? 'active' : ''}`}
              disabled={!podeAdministrar || pending || semTabela}
              onClick={() => run(() => definirPolitica(s.k))}
            >
              <i className={`ti ${s.icon}`} /> {s.label}
            </button>
          ))}
        </div>
        <label
          className="rule-item"
          style={{ cursor: podeAdministrar && !semTabela ? 'pointer' : 'default' }}
          onClick={(e) => {
            e.preventDefault()
            if (podeAdministrar && !semTabela && !pending) run(() => definirPorSessao(!porSessao))
          }}
        >
          <input type="checkbox" checked={porSessao} readOnly />{' '}
          <span><b>Calcular por sessão</b> — o preço de cada sessão é o <b>valor total pago ÷ nº de sessões adquiridas</b>. Cada sessão executada gera uma NFS-e e libera a comissão proporcional àquela sessão.</span>
        </label>
        <div className={`sim-msg ${polMsg.cls}`} style={{ marginTop: 8 }}>
          <i className={`ti ${polMsg.icon}`} /> {polMsg.html}
        </div>
      </div>

      {/* ── Exemplo · preço por sessão ── */}
      <div className="rel-card">
        <div className="rel-card-h"><span><i className="ti ti-calculator flt" /> Exemplo · preço por sessão (NF e comissão)</span></div>
        <div className="metas-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div className="metric-box"><span>Pacote vendido</span><b>R$ 5.000</b></div>
          <div className="metric-box"><span>Sessões adquiridas</span><b>10</b></div>
          <div className="metric-box purple"><span>Preço/sessão (5.000 ÷ 10)</span><b>R$ 500</b></div>
          <div className="metric-box gold"><span>A cada execução</span><b>NF R$ 500 + comissão</b></div>
        </div>
      </div>

      {/* ── Integração com prefeituras ── */}
      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px' }}>
          <span><i className="ti ti-building-bank flt" /> Integração com prefeituras — token por unidade ({conectadas}/{unidades.length} conectadas)</span>
        </div>
        <div className="rel-legend" style={{ margin: '0 14px 8px' }}>
          Cada unidade recolhe o <b>ISS na sua própria prefeitura</b>. O sistema integra com os provedores municipais de
          NFS-e de todo o Brasil (padrões <b>ABRASF, Betha, ISSNet, WebISS, Nota Carioca, NFS-e Paulistana</b>) e com o
          <b> padrão Nacional (ADN / Sefin Nacional)</b> nos municípios aderentes. Informe a inscrição municipal e o
          certificado/token de cada unidade.
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Unidade</th><th>Município</th><th>Provedor NFS-e</th><th className="num-r">Alíquota</th>
                <th>Emissão</th><th>Integração</th><th>Ambiente</th><th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {unidades.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 18 }}>Nenhuma unidade ativa.</td></tr>
              )}
              {unidades.map((u) => (
                <tr key={u.id}>
                  <td><span className="cli-name">{u.nome}</span></td>
                  <td>{u.cidade}{u.uf ? ` / ${u.uf}` : ''}</td>
                  <td>{u.provedor}</td>
                  <td className="num-r">{u.aliquota}% ISS</td>
                  <td>{rotuloEmissao(politica)}</td>
                  <td>{u.conectada ? <span className="os-st os-fechada">Conectada</span> : <span className="os-st os-aberta">Pendente token</span>}</td>
                  <td>{u.conectada ? u.ambiente : ''}</td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '3px 9px' }}
                      disabled={!podeAdministrar || semTabela}
                      onClick={() => { setErro(''); setCfgUnidade(u) }}
                    >
                      <i className="ti ti-plug" /> {u.conectada ? 'Gerenciar' : 'Conectar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── KPIs de notas emitidas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '16px 0 18px' }}>
        {([
          ['Emitidas (autorizadas)', kpis.emitidas.toLocaleString('pt-BR'), 'ti-file-invoice', 'var(--green)'],
          ['Valor total', moedaBR(kpis.valorTotal), 'ti-cash', 'var(--brand-500)'],
          ['Canceladas', kpis.canceladas.toLocaleString('pt-BR'), 'ti-x', 'var(--red)'],
          ['Processando', kpis.processando.toLocaleString('pt-BR'), 'ti-loader', 'var(--amber)'],
        ] as [string, string, string, string][]).map(([label, val, icon, color]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color, flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 18 }}>{val}</b>
            </span>
          </div>
        ))}
      </div>

      {valorCapped && (
        <div className="sim-msg warn-msg" style={{ marginBottom: 14 }}>
          <i className="ti ti-alert-triangle" /> Volume alto: o <b>Valor total</b> considera as primeiras notas autorizadas do recorte. Filtre por competência ou unidade para o total exato.
        </div>
      )}

      {/* ── Filtros de notas emitidas ── */}
      <NotasFiltros unidades={unidades} filtros={filtros} />

      {/* ── Notas emitidas ── */}
      <div className="rel-card-h" style={{ padding: '14px 4px' }}>
        <span><i className="ti ti-file-invoice flt" /> Notas emitidas</span>
        {!semTabela && listaTotal > 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, marginLeft: 10 }}>
            {notas.length.toLocaleString('pt-BR')}
            {listaTotal > notas.length ? ` de ${listaTotal.toLocaleString('pt-BR')}` : ''} nota(s)
          </span>
        )}
        {podeAdministrar && (
          <button
            className="btn btn-primary"
            style={{ padding: '5px 12px', marginLeft: 'auto' }}
            disabled={semTabela}
            onClick={() => { setErro(''); setEmitirOpen(true) }}
          >
            <i className="ti ti-plus" /> Emitir NFS-e manual
          </button>
        )}
      </div>
      <div className="cli-scroll">
        <table className="cli-table">
          <thead>
            <tr>
              <th>Número</th><th>Competência</th><th>Tipo</th><th>Cliente</th>
              <th>Fato gerador</th><th className="num-r">Valor</th><th>Status</th>
              {podeAdministrar && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {notas.length === 0 && (
              <tr><td colSpan={podeAdministrar ? 8 : 7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 22 }}>
                {semTabela ? 'Aplique a migration scripts/migrations/nfse.sql para registrar notas.' : 'Nenhuma nota emitida no período.'}
              </td></tr>
            )}
            {notas.map((n) => {
              const b = badgeStatus(n.status)
              return (
                <tr key={n.id}>
                  <td>{n.numero || '—'}</td>
                  <td>{n.competencia || '—'}</td>
                  <td>{rotuloTipo(n.tipo)}</td>
                  <td><span className="cli-name">{n.clienteNome || '—'}</span></td>
                  <td>{rotuloFato(n.fato_gerador)}</td>
                  <td className="num-r">{moedaBR(n.valor)}</td>
                  <td><span className={`os-st ${b.cls}`}>{b.label}</span></td>
                  {podeAdministrar && (
                    <td>
                      <NotaAcoes nota={n} disabled={pending} run={run} />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {emitirOpen && (
        <EmitirModal
          clientes={clientes}
          activeUnitId={activeUnitId}
          activeUnitName={activeUnitName}
          porSessao={porSessao}
          onClose={() => setEmitirOpen(false)}
          onDone={() => { setEmitirOpen(false); router.refresh() }}
        />
      )}

      {cfgUnidade && (
        <ConfigUnidadeModal
          unidade={cfgUnidade}
          onClose={() => setCfgUnidade(null)}
          onDone={() => { setCfgUnidade(null); router.refresh() }}
        />
      )}
    </div>
  )
}

// ───────────────────────────── Ações por nota (alçada) ─────────────────────────────

function NotaAcoes({ nota, disabled, run }: { nota: NotaRow; disabled: boolean; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {nota.status !== 'cancelada' && (
        <button className="btn btn-ghost" style={{ padding: '3px 8px' }} disabled={disabled} title="Cancelar NF"
          onClick={() => run(() => alterarStatusNota(nota.id, 'cancelada'))}>
          <i className="ti ti-x" />
        </button>
      )}
      {(nota.status === 'erro' || nota.status === 'processando') && (
        <button className="btn btn-ghost" style={{ padding: '3px 8px' }} disabled={disabled} title="Reprocessar/Atualizar NF"
          onClick={() => run(() => alterarStatusNota(nota.id, 'processando'))}>
          <i className="ti ti-refresh" />
        </button>
      )}
      {nota.status !== 'autorizada' && (
        <button className="btn btn-ghost" style={{ padding: '3px 8px' }} disabled={disabled} title="Alterar status manual → Autorizada"
          onClick={() => run(() => alterarStatusNota(nota.id, 'autorizada'))}>
          <i className="ti ti-check" />
        </button>
      )}
    </div>
  )
}

// ───────────────────────────── Filtros ─────────────────────────────

function NotasFiltros({ unidades, filtros }: { unidades: UnidadeFiscal[]; filtros: Props['filtros'] }) {
  const router = useRouter()
  const [comp, setComp] = useState(filtros.comp)
  const [unidade, setUnidade] = useState(filtros.unidade)
  const [tipo, setTipo] = useState(filtros.tipo)
  const [status, setStatus] = useState(filtros.status)

  function pesquisar() {
    const qs = new URLSearchParams()
    if (comp) qs.set('comp', comp)
    if (unidade) qs.set('unidade', unidade)
    if (tipo) qs.set('tipo', tipo)
    if (status) qs.set('status', status)
    router.push(`/notas?${qs.toString()}`)
  }

  return (
    <div className="rel-card">
      <div className="rel-card-h"><span><i className="ti ti-filter flt" /> Filtrar notas emitidas</span></div>
      <div className="rel-filgrid">
        <div className="rf"><label>Competência / período</label><input type="month" value={comp} onChange={(e) => setComp(e.target.value)} /></div>
        <div className="rf"><label>Unidade</label>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            <option value="">Todas</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="rf"><label>Tipo de nota</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todas</option>
            <option value="nfse">NFS-e</option>
            <option value="nfe">NF-e</option>
          </select>
        </div>
        <div className="rf"><label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="autorizada">Autorizada</option>
            <option value="cancelada">Cancelada</option>
            <option value="processando">Processando</option>
            <option value="erro">Erro</option>
          </select>
        </div>
      </div>
      <div className="rel-acts">
        <button className="btn btn-primary" onClick={pesquisar}><i className="ti ti-search" /> Pesquisar</button>
        <button className="btn btn-ghost" title="Exportar XMLs (em breve)" disabled><i className="ti ti-file-code" /> Exportar XMLs</button>
        <button className="btn btn-ghost" title="Exportar (em breve)" disabled><i className="ti ti-download" /> Exportar</button>
      </div>
    </div>
  )
}

// ───────────────────────────── Modal emitir manual ─────────────────────────────

function EmitirModal({
  clientes, activeUnitId, activeUnitName, porSessao, onClose, onDone,
}: {
  clientes: Cliente[]; activeUnitId: string | null; activeUnitName: string; porSessao: boolean
  onClose: () => void; onDone: () => void
}) {
  const [clienteId, setClienteId] = useState('')
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState('nfse')
  const [fato, setFato] = useState(porSessao ? 'sessao' : 'venda')
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7))
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [pending, start] = useTransition()

  function salvar() {
    setErro('')
    if (!activeUnitId) { setErro('Selecione uma unidade ativa para emitir a nota.'); return }
    const v = parseFloat(valor.replace(',', '.'))
    if (!v || v <= 0) { setErro('Informe um valor maior que zero.'); return }
    start(async () => {
      const r = await emitirManual({
        unidadeId: activeUnitId,
        clienteId: clienteId || null,
        competencia: comp || null,
        tipo, fatoGerador: fato, valor: v, observacao: obs || null,
      })
      if (!r.ok) setErro(r.error || 'Falha ao emitir.')
      else onDone()
    })
  }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={{ ...MODAL, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, marginBottom: 4, fontWeight: 700 }}><i className="ti ti-file-invoice" /> Emitir NFS-e manual</h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}><i className="ti ti-building-store" /> {activeUnitName}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {erro && <div className="sim-msg err"><i className="ti ti-alert-triangle" /> {erro}</div>}
          <label style={LBL}>Cliente
            <select style={INP} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">(sem cliente)</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={LBL}>Tipo
              <select style={INP} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="nfse">NFS-e</option>
                <option value="nfe">NF-e</option>
              </select>
            </label>
            <label style={LBL}>Fato gerador
              <select style={INP} value={fato} onChange={(e) => setFato(e.target.value)}>
                <option value="venda">Venda</option>
                <option value="sessao">Sessão executada</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={LBL}>Competência<input style={INP} type="month" value={comp} onChange={(e) => setComp(e.target.value)} /></label>
            <label style={LBL}>Valor (R$)<input style={INP} inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
          </div>
          <label style={LBL}>Observação<input style={INP} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="opcional" /></label>
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>A emissão fiscal real (envio à prefeitura) é processada em seguida — a nota entra como <b>Processando</b>.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={pending}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={pending}>{pending ? 'Emitindo…' : 'Emitir'}</button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── Modal config prefeitura ─────────────────────────────

function ConfigUnidadeModal({ unidade, onClose, onDone }: { unidade: UnidadeFiscal; onClose: () => void; onDone: () => void }) {
  const [inscricao, setInscricao] = useState('')
  const [token, setToken] = useState('')
  const [ambiente, setAmbiente] = useState(unidade.ambiente === 'Homologação' ? 'homologacao' : 'producao')
  const [erro, setErro] = useState('')
  const [pending, start] = useTransition()

  function salvar() {
    setErro('')
    start(async () => {
      const r = await salvarConfigUnidade({
        unidadeId: unidade.id,
        provedor: unidade.provedor,
        aliquotaIss: unidade.aliquota,
        inscricaoMunicipal: inscricao || null,
        certificadoToken: token || null,
        ambiente,
        conectar: !!(inscricao && token),
      })
      if (!r.ok) setErro(r.error || 'Falha ao salvar.')
      else onDone()
    })
  }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={{ ...MODAL, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, marginBottom: 4, fontWeight: 700 }}><i className="ti ti-plug-connected" /> Prefeitura · {unidade.nome}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
          {unidade.cidade}{unidade.uf ? ` / ${unidade.uf}` : ''} · Provedor <b>{unidade.provedor}</b> · Alíquota <b>{unidade.aliquota}% ISS</b>
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {erro && <div className="sim-msg err"><i className="ti ti-alert-triangle" /> {erro}</div>}
          <label style={LBL}>Inscrição municipal<input style={INP} value={inscricao} onChange={(e) => setInscricao(e.target.value)} placeholder="000.000.000" /></label>
          <label style={LBL}>Certificado / token<input style={INP} value={token} onChange={(e) => setToken(e.target.value)} placeholder="token de acesso à prefeitura" /></label>
          <label style={LBL}>Ambiente
            <select style={INP} value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
              <option value="producao">Produção</option>
              <option value="homologacao">Homologação</option>
            </select>
          </label>
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Informe inscrição municipal e certificado/token para marcar a unidade como <b>Conectada</b>.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={pending}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// Estilos compartilhados dos modais (convenção inline do projeto).
const OVERLAY: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const MODAL: React.CSSProperties = { width: '100%', padding: 22, background: '#fff', borderRadius: 14, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }
const LBL: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, display: 'block' }
const INP: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, marginTop: 4 }
