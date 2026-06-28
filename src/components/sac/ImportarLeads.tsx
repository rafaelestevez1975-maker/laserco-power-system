'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { importarTickets, type LinhaImport } from '@/app/(app)/sac/importar/actions'

type Unidade = { id: string; nome: string }
type Mapeamento = { nome: string; telefone: string; email: string; cpf: string; motivo: string; obs: string; valor_pago: string; valor_devolucao: string; data: string }

const CANAIS = ['Reclame Aqui', 'Procon', 'Sults', 'Blip', 'WhatsApp', 'E-mail', 'Instagram', 'Telefone', 'Manual', 'Formulário']
const CAMPOS: { key: keyof Mapeamento; label: string; req?: boolean }[] = [
  { key: 'nome', label: 'Nome do cliente', req: true },
  { key: 'telefone', label: 'Telefone / WhatsApp' },
  { key: 'email', label: 'E-mail' },
  { key: 'cpf', label: 'CPF' },
  { key: 'motivo', label: 'Motivo / assunto' },
  { key: 'valor_pago', label: 'Valor pago (R$)' },
  { key: 'valor_devolucao', label: 'Reembolso solicitado (R$)' },
  { key: 'data', label: 'Data da reclamação' },
  { key: 'obs', label: 'Observação / relato' },
]
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function autoMap(headers: string[]): Mapeamento {
  const find = (...alts: string[]) => headers.find((h) => alts.some((a) => norm(h).includes(a))) || ''
  return {
    nome: find('nome', 'cliente', 'consumidor', 'reclamante'),
    telefone: find('telefone', 'whatsapp', 'celular', 'fone', 'contato'),
    email: find('email', 'e-mail'),
    cpf: find('cpf', 'documento'),
    motivo: find('motivo', 'assunto', 'titulo', 'reclamacao', 'problema'),
    valor_pago: find('valor pago', 'valorpago', 'vlr pago', 'valor'),
    valor_devolucao: find('reembolso', 'devolu', 'restitu', 'solicitado'),
    data: find('data', 'abertura'),
    obs: find('observ', 'descricao', 'mensagem', 'detalhe', 'relato'),
  }
}

export function ImportarLeads({ unidades, activeUnitId }: { unidades: Unidade[]; activeUnitId: string | null }) {
  const router = useRouter()
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [map, setMap] = useState<Mapeamento | null>(null)
  const [canal, setCanal] = useState('Reclame Aqui')
  const [unidadeId, setUnidadeId] = useState(activeUnitId || '')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function onFile(file: File | null | undefined) {
    if (!file) return
    setErr(''); setMsg(''); setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      if (!json.length) { setErr('Planilha vazia.'); return }
      const hs = Object.keys(json[0])
      setHeaders(hs); setRows(json); setMap(autoMap(hs))
    } catch {
      setErr('Não consegui ler o arquivo. Use .xlsx ou .csv.')
    }
  }

  async function baixarModelo() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nome', 'Telefone', 'Email', 'CPF', 'Motivo', 'Valor Pago', 'Reembolso Solicitado', 'Data', 'Observação'],
      ['Maria Silva', '11999990000', 'maria@email.com', '12345678900', 'Reclamação de atendimento', '1200,00', '600,00', '10/05/2026', 'Cliente pede retorno'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo')
    XLSX.writeFile(wb, 'modelo-importacao-sac.xlsx')
  }

  const val = (r: Record<string, unknown>, col: string) => (col ? String(r[col] ?? '').trim() : '')
  const linhas: LinhaImport[] = map
    ? rows.map((r) => ({ nome: val(r, map.nome), telefone: val(r, map.telefone), email: val(r, map.email), cpf: val(r, map.cpf), motivo: val(r, map.motivo), valor_pago: val(r, map.valor_pago), valor_devolucao: val(r, map.valor_devolucao), data: val(r, map.data), obs: val(r, map.obs) }))
    : []
  const validas = linhas.filter((l) => l.nome)

  function reset() { setHeaders([]); setRows([]); setMap(null); setFileName('') }

  async function importar() {
    if (!map?.nome) { setErr('Mapeie a coluna do Nome do cliente.'); return }
    if (!validas.length) { setErr('Nenhuma linha com nome de cliente.'); return }
    setBusy(true); setErr(''); setMsg('')
    const r = await importarTickets({ linhas: validas, canal, unidadeId: unidadeId || null })
    setBusy(false)
    if (!r.ok) { setErr(r.error || 'Erro ao importar.'); return }
    setMsg(`${r.inseridos} chamado(s) importado(s) como "${canal}".${r.ignorados ? ` ${r.ignorados} linha(s) ignorada(s) (sem nome).` : ''}`)
    reset(); router.refresh()
  }

  return (
    <>
      {/* Header idêntico ao legado (sacImportar, index.html:9141): card .rel-card com título
          ti-file-import brand-500 + descrição das colunas esperadas. */}
      <div className="rel-card" style={{ marginBottom: 12 }}>
        <b><i className="ti ti-file-import" style={{ color: 'var(--brand-500)' }} /> Importar leads / reclamações</b>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '6px 0 0' }}>Importe uma planilha (.xlsx) com reclamações vindas de Sults, Reclame Aqui, Procon ou planilhas internas. Colunas: Cliente, CPF, WhatsApp, Canal, Unidade, Motivo, Data, Valor Pago, Reembolso.</p>
      </div>

      {/* Card de ação idêntico ao legado (index.html:9142): "Baixar modelo" (ghost) +
          "Selecionar planilha" (primary) + info. O mapeamento real fica no card abaixo. */}
      <div className="rel-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-ghost" onClick={baixarModelo}><i className="ti ti-download" /> Baixar modelo</button>
        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          <i className="ti ti-upload" /> Selecionar planilha
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {fileName && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fileName} · {rows.length} linha(s)</span>}
        {err && <span style={{ fontSize: 12, color: 'var(--red)' }}>{err}</span>}
        {msg && <span style={{ fontSize: 12, color: '#15803D' }}>{msg}</span>}
      </div>

      {map && (
        <div className="rel-card" style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Canal (origem da planilha)</label>
              <select style={inp} value={canal} onChange={(e) => setCanal(e.target.value)}>{CANAIS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Unidade</label>
              <select style={inp} value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
                <option value="">Sem unidade / central</option>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, margin: '6px 0 8px' }}>Mapeamento de colunas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10, marginBottom: 14 }}>
            {CAMPOS.map((campo) => (
              <div key={campo.key}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>{campo.label}{campo.req && ' *'}</label>
                <select style={inp} value={map[campo.key]} onChange={(e) => setMap({ ...map, [campo.key]: e.target.value })}>
                  <option value="">— ignorar —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, margin: '6px 0 8px' }}>Prévia ({validas.length} válida(s) de {rows.length})</div>
          <div className="cli-scroll" style={{ border: '1px solid var(--line)', borderRadius: 8, marginBottom: 14 }}>
            <table className="cli-table">
              <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Motivo</th></tr></thead>
              <tbody>
                {validas.slice(0, 5).map((l, i) => (
                  <tr key={i}><td>{l.nome}</td><td>{l.telefone}</td><td>{l.email}</td><td>{l.motivo}</td></tr>
                ))}
                {validas.length === 0 && <tr><td colSpan={4} style={{ padding: 14, color: 'var(--text-3)' }}>Nenhuma linha com nome — confira o mapeamento.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={reset}>Cancelar</button>
            <button className="btn btn-primary" disabled={busy || validas.length === 0} onClick={importar}>
              {busy ? 'Importando…' : <><i className="ti ti-download" /> Importar {validas.length} chamado(s)</>}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
