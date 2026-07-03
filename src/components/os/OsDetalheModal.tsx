'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { moedaBR, dataBR, dataHoraBR } from '@/lib/fmt'
import {
  carregarDetalheOS, adicionarItem, removerItem, finalizarOS, cancelarOS, registrarPagamento,
  type OsDetalhe, type OsItemDetalhe, type OsPagamentoDetalhe,
} from '@/app/(app)/os/actions'
import type { OsRow, ServicoOpt } from './OsList'

const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', fechada: 'Fechada', cancelada: 'Cancelada' }
const STATUS_CLASS: Record<string, string> = { aberta: 'os-aberta', fechada: 'os-fechada', cancelada: 'os-cancelada' }
const ORIGEM_LABEL: Record<string, string> = {
  avulsa: 'Avulsa', agendamento: 'Agendamento', pacote: 'Pacote', assinatura: 'Assinatura', interna: 'Interna', multa_assinatura: 'Multa de assinatura',
}
const METODO_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro', cartao_credito: 'Crédito', cartao_debito: 'Débito', cheque: 'Cheque',
  credito_recorrente: 'Crédito recorrente', cartao_presente: 'Cartão presente', assinatura: 'Assinatura', pix: 'PIX', outros: 'Outros',
}
const METODOS = Object.keys(METODO_LABEL)
const KIND_LABEL: Record<string, string> = { servico: 'Serviço', produto: 'Produto', pacote: 'Pacote' }

export function OsDetalheModal({
  os, podeEscrever, activeUnitId, servicos, onClose,
}: { os: OsRow; podeEscrever: boolean; activeUnitId: string | null; servicos: ServicoOpt[]; onClose: () => void }) {
  const router = useRouter()
  const [detalhe, setDetalhe] = useState<OsDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState('')

  const aberta = os.status === 'aberta'

  const carregar = useCallback(async () => {
    setLoading(true)
    const r = await carregarDetalheOS(os.id, activeUnitId)
    setLoading(false)
    if (!r.ok) { setErro(r.error); return }
    setDetalhe(r.data)
  }, [os.id, activeUnitId])

  useEffect(() => { void carregar() }, [carregar])

  function refresh() {
    void carregar()
    router.refresh()
  }

  // ── Form: adicionar serviço ──
  const [servId, setServId] = useState('')
  const [qtd, setQtd] = useState('1')
  const [preco, setPreco] = useState('')
  const [desc, setDesc] = useState('')

  function onSelServ(id: string) {
    setServId(id)
    const s = servicos.find((x) => x.id === id)
    if (s && !preco) setPreco(String(s.preco))
  }

  async function addItem() {
    setErro('')
    if (!servId) { setErro('Selecione um serviço.'); return }
    setBusy('add')
    const r = await adicionarItem({
      osId: os.id,
      kind: 'servico',
      refId: servId,
      quantidade: Number(qtd) || 1,
      preco: preco.trim() ? Number(preco.replace(',', '.')) : 0,
      desconto: desc.trim() ? Number(desc.replace(',', '.')) : 0,
    }, activeUnitId)
    setBusy('')
    if (!r.ok) { setErro(r.error || 'Erro ao adicionar item.'); return }
    setServId(''); setQtd('1'); setPreco(''); setDesc('')
    refresh()
  }

  async function delItem(item: OsItemDetalhe) {
    setErro(''); setBusy(item.id)
    const r = await removerItem(item.kind, item.id, os.id, activeUnitId)
    setBusy('')
    if (!r.ok) { setErro(r.error || 'Erro ao remover item.'); return }
    refresh()
  }

  async function finalizar() {
    setErro(''); setBusy('fin')
    const r = await finalizarOS(os.id, activeUnitId)
    setBusy('')
    if (!r.ok) { setErro(r.error || 'Erro ao finalizar.'); return }
    onClose(); router.refresh()
  }

  async function cancelar() {
    if (!confirm('Cancelar esta OS? Esta ação não pode ser desfeita.')) return
    setErro(''); setBusy('cancel')
    const r = await cancelarOS(os.id, activeUnitId)
    setBusy('')
    if (!r.ok) { setErro(r.error || 'Erro ao cancelar.'); return }
    onClose(); router.refresh()
  }

  // ── Form: pagamento ──
  const [pagMetodo, setPagMetodo] = useState('dinheiro')
  const [pagValor, setPagValor] = useState('')

  async function addPagamento() {
    setErro('')
    const v = pagValor.trim() ? Number(pagValor.replace(',', '.')) : 0
    if (!v || v <= 0) { setErro('Informe um valor de pagamento válido.'); return }
    setBusy('pag')
    const r = await registrarPagamento({ osId: os.id, metodo: pagMetodo, valor: v }, activeUnitId)
    setBusy('')
    if (!r.ok) { setErro(r.error || 'Erro ao registrar pagamento.'); return }
    setPagValor('')
    refresh()
  }

  const inp: React.CSSProperties = { padding: '7px 9px', border: '1px solid var(--line-strong)', borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit', background: '#fff', outline: 'none' }
  const rowSt: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--line)' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: '#fff', borderRadius: 14, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '18px 22px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>
              <i className="ti ti-clipboard-text" /> OS #{os.numero ?? ''} {os.clienteNome ? `· ${os.clienteNome}` : ''}
            </h3>
            <span className={`os-st ${STATUS_CLASS[os.status] || ''}`}>{STATUS_LABEL[os.status] || os.status}</span>
            <button className="btn btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}><i className="ti ti-x" /></button>
          </div>
        </div>

        <div style={{ padding: '14px 22px 22px' }}>
          {/* Cabeçalho de dados */}
          <div style={rowSt}><span style={{ color: 'var(--text-2)' }}>Cliente</span><b>{os.clienteNome || ' sem cliente '}</b></div>
          <div style={rowSt}><span style={{ color: 'var(--text-2)' }}>Origem</span><span><span className="orig-tag">{ORIGEM_LABEL[os.origem || ''] || os.origem || ''}</span></span></div>
          <div style={rowSt}><span style={{ color: 'var(--text-2)' }}>Responsável</span><span>{os.responsavelNome || ''}</span></div>
          <div style={rowSt}><span style={{ color: 'var(--text-2)' }}>Criação</span><span>{dataHoraBR(os.criado_em) || ''}</span></div>
          {os.fechada_em && <div style={rowSt}><span style={{ color: 'var(--text-2)' }}>Fechamento</span><span>{dataBR(os.fechada_em)}</span></div>}
          {os.cancelada_em && <div style={rowSt}><span style={{ color: 'var(--text-2)' }}>Cancelamento</span><span>{dataBR(os.cancelada_em)}</span></div>}
          {os.observacao && <div style={{ ...rowSt, borderBottom: 'none' }}><span style={{ color: 'var(--text-2)' }}>Observação</span><span style={{ textAlign: 'right', maxWidth: '60%' }}>{os.observacao}</span></div>}

          {erro && <p style={{ color: 'var(--red)', fontSize: 12.5, margin: '10px 0' }}>{erro}</p>}

          {/* Itens da OS */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}><i className="ti ti-list-details" /> Itens da OS</div>
            {loading && <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: 10 }}>Carregando itens…</div>}
            {!loading && detalhe && detalhe.itens.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '10px 0' }}>Nenhum item nesta OS ainda.</div>
            )}
            {!loading && detalhe && detalhe.itens.length > 0 && (
              <table className="cli-table" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr><th>Item</th><th>Tipo</th><th className="num-r">Qtd</th><th className="num-r">Preço</th><th className="num-r">Desc.</th><th className="num-r">Total</th>{aberta && podeEscrever && <th></th>}</tr>
                </thead>
                <tbody>
                  {detalhe.itens.map((it) => (
                    <tr key={it.id}>
                      <td>{it.nome}{it.profissionalNome && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{it.profissionalNome}</div>}</td>
                      <td><span className="orig-tag">{KIND_LABEL[it.kind]}</span></td>
                      <td className="num-r">{it.quantidade}</td>
                      <td className="num-r">{moedaBR(it.preco)}</td>
                      <td className="num-r">{it.desconto ? moedaBR(it.desconto) : ''}</td>
                      <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(it.total)}</td>
                      {aberta && podeEscrever && (
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-ghost" style={{ color: 'var(--red)', padding: '2px 7px' }} disabled={busy === it.id} onClick={() => delItem(it)} title="Remover">
                            {busy === it.id ? '…' : <i className="ti ti-trash" />}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Adicionar serviço (só com OS aberta + permissão) */}
            {aberta && podeEscrever && (
              <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-2)', borderRadius: 9, display: 'grid', gridTemplateColumns: '2fr 60px 90px 90px auto', gap: 7, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 3 }}>Serviço</label>
                  <select style={{ ...inp, width: '100%' }} value={servId} onChange={(e) => onSelServ(e.target.value)}>
                    <option value="">Selecione…</option>
                    {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 3 }}>Qtd</label>
                  <input style={{ ...inp, width: '100%' }} value={qtd} onChange={(e) => setQtd(e.target.value)} inputMode="numeric" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 3 }}>Preço</label>
                  <input style={{ ...inp, width: '100%' }} value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="0,00" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 3 }}>Desc.</label>
                  <input style={{ ...inp, width: '100%' }} value={desc} onChange={(e) => setDesc(e.target.value)} inputMode="decimal" placeholder="0,00" />
                </div>
                <button className="btn btn-primary" disabled={busy === 'add'} onClick={addItem} style={{ height: 32 }}>
                  {busy === 'add' ? '…' : <><i className="ti ti-plus" /> Adicionar</>}
                </button>
              </div>
            )}
            {aberta && podeEscrever && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                {/* TODO(legado: buildOS): produtos e pacotes na OS  tabelas os_produtos/os_pacotes existem mas
                    o catálogo (produtos/pacotes) está vazio no backend; ofertamos serviços por enquanto. */}
                <i className="ti ti-info-circle" /> Produtos e pacotes ficam disponíveis quando o catálogo for cadastrado.
              </p>
            )}
          </div>

          {/* Totais */}
          <div style={{ marginTop: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>Desconto</span><span>{moedaBR(os.desconto_total)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}><span>Total da OS</span><span>{moedaBR(os.total)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--green)', marginTop: 4 }}><span>Pago</span><span>{moedaBR(os.valor_pago)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: (os.valor_pendente || 0) > 0 ? 'var(--red)' : 'var(--text-3)' }}><span>Pendente</span><span>{moedaBR(os.valor_pendente)}</span></div>
          </div>

          {/* Pagamentos */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}><i className="ti ti-cash" /> Pagamentos</div>
            {!loading && detalhe && detalhe.pagamentos.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '4px 0' }}>Nenhum pagamento registrado.</div>
            )}
            {!loading && detalhe && detalhe.pagamentos.map((p: OsPagamentoDetalhe) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{dataBR(p.data)} · {METODO_LABEL[p.metodo || ''] || p.metodo || ''}{p.status && p.status !== 'aprovado' ? ` (${p.status})` : ''}</span>
                <b>{moedaBR(p.valor)}</b>
              </div>
            ))}
            {os.status !== 'cancelada' && podeEscrever && (
              <div style={{ marginTop: 8, display: 'flex', gap: 7, alignItems: 'end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 3 }}>Método</label>
                  <select style={{ ...inp, width: '100%' }} value={pagMetodo} onChange={(e) => setPagMetodo(e.target.value)}>
                    {METODOS.map((m) => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
                  </select>
                </div>
                <div style={{ width: 110 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 3 }}>Valor</label>
                  <input style={{ ...inp, width: '100%' }} value={pagValor} onChange={(e) => setPagValor(e.target.value)} inputMode="decimal" placeholder="0,00" />
                </div>
                <button className="btn" disabled={busy === 'pag'} onClick={addPagamento} style={{ height: 32 }}>
                  {busy === 'pag' ? '…' : <><i className="ti ti-plus" /> Pagar</>}
                </button>
              </div>
            )}
          </div>

          {/* Ações de status */}
          {aberta && podeEscrever && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn" style={{ color: 'var(--red)', borderColor: '#E7B7BC' }} disabled={busy === 'cancel'} onClick={cancelar}>
                {busy === 'cancel' ? '…' : <><i className="ti ti-ban" /> Cancelar OS</>}
              </button>
              <button className="btn btn-primary" disabled={busy === 'fin'} onClick={finalizar}>
                {busy === 'fin' ? '…' : <><i className="ti ti-checks" /> Finalizar OS</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
