'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { finalizarVenda, type VendaKind, type FinalizarVendaInput } from '@/app/(app)/pdv/actions'
import { FORMAS_PDV, PARCELAS_PDV } from '@/lib/pdv'

export type CatalogoItem = { kind: VendaKind; id: string; nome: string; grupo: string | null; preco: number }
export type Opcao = { id: string; nome: string }
type CartItem = { key: string; kind: VendaKind; refId: string; nome: string; preco: number; qtd: number }

const brl = (n: number) => `R$ ${(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const ABAS: { value: VendaKind; label: string; icon: string }[] = [
  { value: 'servico', label: 'Serviços', icon: 'ti-sparkles' },
  { value: 'pacote', label: 'Pacotes', icon: 'ti-box' },
  { value: 'produto', label: 'Produtos', icon: 'ti-package' },
]

export function PdvManager({
  activeUnitId, activeUnitName, podeVender, descLimit, cortesiaUsada, cortesiaLimite,
  servicos, produtos, pacotes, clientes, vendedores, vendedorPadrao,
}: {
  activeUnitId: string | null
  activeUnitName: string
  podeVender: boolean
  descLimit: number
  cortesiaUsada: number
  cortesiaLimite: number
  servicos: CatalogoItem[]
  produtos: CatalogoItem[]
  pacotes: CatalogoItem[]
  clientes: Opcao[]
  vendedores: Opcao[]
  vendedorPadrao: string
}) {
  const router = useRouter()
  const [aba, setAba] = useState<VendaKind>('servico')
  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState<CartItem[]>([])
  const [clienteId, setClienteId] = useState('')
  const [clienteBusca, setClienteBusca] = useState('')
  const [vendedorNome, setVendedorNome] = useState(vendedorPadrao)
  const [descontoPct, setDescontoPct] = useState('0')
  const [forma, setForma] = useState(FORMAS_PDV[0].value)
  const [parcelas, setParcelas] = useState(1)
  const [emitirNfse, setEmitirNfse] = useState(false)
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [sucesso, setSucesso] = useState<number | null>(null)

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }

  const fonte = aba === 'servico' ? servicos : aba === 'pacote' ? pacotes : produtos
  const catalogo = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = q ? fonte.filter((i) => i.nome.toLowerCase().includes(q) || (i.grupo || '').toLowerCase().includes(q)) : fonte
    return base.slice(0, 40)
  }, [fonte, busca])

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusca.trim().toLowerCase()
    if (!q) return clientes.slice(0, 8)
    return clientes.filter((c) => c.nome.toLowerCase().includes(q)).slice(0, 8)
  }, [clienteBusca, clientes])
  const clienteNome = clientes.find((c) => c.id === clienteId)?.nome ?? ''

  const subtotal = useMemo(() => carrinho.reduce((s, i) => s + i.preco * i.qtd, 0), [carrinho])
  const pct = Math.max(0, Math.min(100, Number(descontoPct) || 0))
  const descontoValor = subtotal * (pct / 100)
  const total = Math.max(0, subtotal - descontoValor)
  const excedeAlcada = pct > descLimit
  const ehCortesia = total <= 0 && subtotal > 0
  const cortesiaRestante = Math.max(0, cortesiaLimite - cortesiaUsada)
  const cortesiaEstoura = ehCortesia && cortesiaUsada + subtotal > cortesiaLimite

  function addItem(it: CatalogoItem) {
    setSucesso(null)
    setCarrinho((cur) => {
      const idx = cur.findIndex((c) => c.kind === it.kind && c.refId === it.id)
      if (idx >= 0) { const n = [...cur]; n[idx] = { ...n[idx], qtd: n[idx].qtd + 1 }; return n }
      return [...cur, { key: `${it.kind}:${it.id}`, kind: it.kind, refId: it.id, nome: it.nome, preco: it.preco, qtd: 1 }]
    })
  }
  const setQtd = (key: string, delta: number) =>
    setCarrinho((cur) => cur.map((c) => (c.key === key ? { ...c, qtd: Math.max(1, c.qtd + delta) } : c)))
  const removeItem = (key: string) => setCarrinho((cur) => cur.filter((c) => c.key !== key))

  function novaVenda() {
    setCarrinho([]); setClienteId(''); setClienteBusca(''); setDescontoPct('0')
    setForma(FORMAS_PDV[0].value); setParcelas(1); setEmitirNfse(false); setObs(''); setErr(''); setSucesso(null)
  }

  async function finalizar() {
    setErr('')
    if (!activeUnitId) { setErr('Selecione uma unidade ativa no topo para registrar a venda.'); return }
    if (carrinho.length === 0) { setErr('Adicione ao menos um item ao carrinho.'); return }
    if (excedeAlcada) { setErr(`Desconto de ${pct}% acima da sua alçada (máx ${descLimit}%). Necessária aprovação do gestor.`); return }
    if (cortesiaEstoura) { setErr(`Teto mensal de cortesias da unidade atingido. Restam ${brl(cortesiaRestante)}.`); return }
    setSaving(true)
    const input: FinalizarVendaInput = {
      unidadeId: activeUnitId,
      clienteId: clienteId || null,
      vendedorNome: vendedorNome.trim() || null,
      itens: carrinho.map((c) => ({ kind: c.kind, refId: c.refId, nome: c.nome, preco: c.preco, quantidade: c.qtd })),
      descontoPct: pct,
      forma,
      parcelas,
      emitirNfse,
      observacao: obs.trim() || null,
    }
    const res = await finalizarVenda(input)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao finalizar a venda.'); return }
    setSucesso(res.numero ?? 0)
    setCarrinho([]); setDescontoPct('0'); setObs(''); setEmitirNfse(false)
    router.refresh()
  }

  if (!podeVender) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-2)' }}>
        <i className="ti ti-lock" style={{ fontSize: 28, color: 'var(--amber)' }} />
        <p style={{ marginTop: 8, fontSize: 14 }}>Você não tem permissão para registrar vendas (PDV).</p>
      </div>
    )
  }

  return (
    <div>
      {/* Cabeçalho: unidade + alçada + cortesia */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}><i className="ti ti-building-store" /> {activeUnitName}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}><i className="ti ti-discount-2" /> Sua alçada de desconto: <b>{descLimit}%</b></span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}><i className="ti ti-gift" /> Cortesias do mês: {brl(cortesiaUsada)} / {brl(cortesiaLimite)} (restam {brl(cortesiaRestante)})</span>
        {!activeUnitId && <span style={{ fontSize: 12, color: 'var(--amber)' }}><i className="ti ti-alert-triangle" /> Selecione uma unidade ativa para vender.</span>}
      </div>

      {sucesso !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--green-50, #E8F6EE)', color: 'var(--green, #138a4e)', marginBottom: 14, fontSize: 13.5 }}>
          <i className="ti ti-circle-check" style={{ fontSize: 18 }} />
          <span>Venda registrada! <b>OS #{sucesso}</b> criada e fechada.</span>
          <button className="btn" style={{ marginLeft: 'auto', padding: '4px 10px' }} onClick={novaVenda}><i className="ti ti-plus" /> Nova venda</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        {/* ───────── Coluna catálogo ───────── */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {ABAS.map((a) => (
              <button key={a.value} className={`btn ${aba === a.value ? 'btn-primary' : ''}`} style={{ padding: '6px 12px', fontSize: 12.5 }}
                onClick={() => { setAba(a.value); setBusca('') }}>
                <i className={`ti ${a.icon}`} /> {a.label}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-3)' }} />
            <input style={{ ...inp, paddingLeft: 30 }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${ABAS.find((a) => a.value === aba)?.label.toLowerCase()}…`} />
          </div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 460, overflow: 'auto' }}>
            {catalogo.length === 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', padding: 12, textAlign: 'center' }}>Nenhum item encontrado.</p>
            )}
            {catalogo.map((it) => (
              <button key={`${it.kind}:${it.id}`} onClick={() => addItem(it)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 9, background: '#fff', cursor: 'pointer' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nome}</span>
                  {it.grupo && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{it.grupo}</span>}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-600, #b13)' }}>{brl(it.preco)}</span>
                <i className="ti ti-plus" style={{ color: 'var(--brand-500)' }} />
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>Mostrando até 40 itens. Refine com a busca.</p>
        </div>

        {/* ───────── Coluna carrinho + pagamento ───────── */}
        <div className="card" style={{ padding: 14, display: 'grid', gap: 12 }}>
          {/* Cliente */}
          <div>
            <label style={lbl}>Cliente</label>
            {clienteId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, background: 'var(--surface-2)' }}>
                <i className="ti ti-user" style={{ color: 'var(--brand-500)' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{clienteNome}</span>
                <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '2px 8px' }} onClick={() => { setClienteId(''); setClienteBusca('') }}><i className="ti ti-x" /> Trocar</button>
              </div>
            ) : (
              <>
                <input style={inp} value={clienteBusca} onChange={(e) => setClienteBusca(e.target.value)} placeholder="🔎 Buscar cliente (opcional — balcão)" />
                {clienteBusca.trim() && (
                  <div style={{ marginTop: 6, border: '1px solid var(--line)', borderRadius: 8, maxHeight: 160, overflow: 'auto' }}>
                    {clientesFiltrados.length === 0 && <div style={{ padding: 10, fontSize: 12.5, color: 'var(--text-3)' }}>Nenhum cliente.</div>}
                    {clientesFiltrados.map((c) => (
                      <button key={c.id} onClick={() => { setClienteId(c.id); setClienteBusca('') }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', fontSize: 13, background: 'none', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>{c.nome}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Carrinho */}
          <div>
            <label style={lbl}>Carrinho ({carrinho.length})</label>
            {carrinho.length === 0 ? (
              <div style={{ padding: 18, textAlign: 'center', border: '1px dashed var(--line-strong)', borderRadius: 9, color: 'var(--text-3)', fontSize: 12.5 }}>
                <i className="ti ti-shopping-cart" style={{ fontSize: 22 }} /><br />Clique nos itens à esquerda para adicionar.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {carrinho.map((c) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{brl(c.preco)} un.</span>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button className="btn btn-ghost" style={{ padding: '2px 7px' }} onClick={() => setQtd(c.key, -1)}><i className="ti ti-minus" /></button>
                      <span style={{ minWidth: 22, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{c.qtd}</span>
                      <button className="btn btn-ghost" style={{ padding: '2px 7px' }} onClick={() => setQtd(c.key, 1)}><i className="ti ti-plus" /></button>
                    </div>
                    <span style={{ minWidth: 84, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{brl(c.preco * c.qtd)}</span>
                    <button className="btn btn-ghost" style={{ padding: '2px 6px', color: 'var(--red)' }} onClick={() => removeItem(c.key)}><i className="ti ti-trash" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totais + desconto */}
          <div style={{ display: 'grid', gap: 6, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <Row label="Subtotal" value={brl(subtotal)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: 'var(--text-2)', flex: 1 }}>Desconto (%)</label>
              <input type="number" min={0} max={100} value={descontoPct} onChange={(e) => setDescontoPct(e.target.value)}
                style={{ ...inp, width: 80, textAlign: 'right' }} />
              <span style={{ minWidth: 90, textAlign: 'right', fontSize: 13, color: 'var(--red)' }}>− {brl(descontoValor)}</span>
            </div>
            {excedeAlcada && (
              <p style={{ fontSize: 11.5, color: 'var(--amber)' }}><i className="ti ti-alert-triangle" /> Acima da sua alçada (máx {descLimit}%) — requer aprovação do gestor.</p>
            )}
            {ehCortesia && (
              <p style={{ fontSize: 11.5, color: cortesiaEstoura ? 'var(--red)' : 'var(--text-3)' }}>
                <i className="ti ti-gift" /> Cortesia (100%): {cortesiaEstoura ? 'estoura o teto mensal da unidade.' : `consome ${brl(subtotal)} do teto (restam ${brl(cortesiaRestante)}).`}
              </p>
            )}
            <Row label="Total" value={brl(total)} strong />
          </div>

          {/* Pagamento */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Forma de pagamento</label>
              <select style={inp} value={forma} onChange={(e) => setForma(e.target.value)}>
                {FORMAS_PDV.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Parcelas</label>
              <select style={inp} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
                {PARCELAS_PDV.map((p) => <option key={p} value={p}>{p}x</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Vendedor(a)</label>
              <input style={inp} value={vendedorNome} onChange={(e) => setVendedorNome(e.target.value)} list="pdv-vendedores" placeholder="Quem vendeu" />
              <datalist id="pdv-vendedores">{vendedores.map((v) => <option key={v.id} value={v.nome} />)}</datalist>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', paddingBottom: 8 }}>
                <input type="checkbox" checked={emitirNfse} onChange={(e) => setEmitirNfse(e.target.checked)} /> Emitir NFS-e ao finalizar
              </label>
            </div>
          </div>

          <div>
            <label style={lbl}>Observação</label>
            <textarea style={{ ...inp, minHeight: 46, resize: 'vertical' }} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Anotações da venda (opcional)" />
          </div>

          {err && <p style={{ color: 'var(--red)', fontSize: 12.5 }}><i className="ti ti-alert-circle" /> {err}</p>}

          <button className="btn btn-primary" style={{ padding: '11px 16px', fontSize: 14, justifyContent: 'center' }}
            disabled={saving || !activeUnitId || carrinho.length === 0 || excedeAlcada || cortesiaEstoura}
            onClick={finalizar}>
            {saving ? 'Finalizando…' : <><i className="ti ti-cash-register" /> Finalizar venda · {brl(total)}</>}
          </button>
          {emitirNfse && <p style={{ fontSize: 11, color: 'var(--text-3)' }}><i className="ti ti-info-circle" /> NFS-e fica registrada como solicitada (emissão fiscal real depende do backend de notas).</p>}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: strong ? 16 : 13, fontWeight: strong ? 800 : 500, color: strong ? 'var(--text-1)' : 'var(--text-2)' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  )
}
