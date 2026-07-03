'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  type ImpField, impParseCSV, impAutoMap, impProcess, IMP_MODELO_CSV,
} from '@/lib/clientes'
import { importarClientes, type ImportRecord } from '@/app/(app)/clientes/actions'

type Unidade = { id: string; nome: string }

// "Onde nos conheceu?"  mesmas 9 opções do legado (cliModal).
const ORIGENS = [
  'Indicação de amigo', 'Instagram', 'Facebook', 'Google / Busca', 'Site da rede',
  'Landing Page', 'WhatsApp', 'Passei em frente à loja', 'Outro', 'Migração BEMP',
]

// campos exibidos no mapeamento (legado: nome/telefone/email/documento/genero/unidade)
const MAP_FIELDS: ImpField[] = ['nome', 'telefone', 'email', 'documento', 'genero', 'ativo', 'verificado', 'unidade', 'origem']

export function ImportarClientesModal({ unidades, unidadeSugerida }: { unidades: Unidade[]; unidadeSugerida: string | null }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [map, setMap] = useState<Partial<Record<ImpField, number>>>({})
  const [uni, setUni] = useState<string>(unidadeSugerida ?? '')
  const [origem, setOrigem] = useState('Migração BEMP')
  const [dedup, setDedup] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  function reset() {
    setFileName(''); setHeaders([]); setRows([]); setMap({}); setErr(''); setInfo(''); setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }
  function fechar() { setOpen(false); reset() }

  function lerArquivo(file: File) {
    setErr(''); setInfo('')
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (ext === 'xlsx' || ext === 'xls') {
      setErr('Arquivos .xlsx/.xls não são suportados aqui. Exporte a planilha como CSV (separador ; ou ,) e tente novamente. Use "Baixar modelo de planilha".')
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const { headers: h, rows: r } = impParseCSV(String(e.target?.result || ''))
        if (!h.length) { setErr('Não encontrei colunas no arquivo.'); return }
        setHeaders(h); setRows(r); setMap(impAutoMap(h))
        setInfo(`${r.length.toLocaleString('pt-BR')} registro(s) lido(s). Confira o mapeamento das colunas:`)
      } catch (ex) {
        setErr('Não consegui ler o arquivo: ' + (ex instanceof Error ? ex.message : String(ex)))
      }
    }
    reader.readAsText(file)
  }

  function baixarModelo() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([IMP_MODELO_CSV], { type: 'text/csv' }))
    a.download = 'modelo_importacao_clientes.csv'
    a.click()
  }

  async function importar() {
    if (!rows.length) { setErr('Selecione um arquivo.'); return }
    setBusy(true); setErr(''); setInfo('')
    const { recs, dups, genFill } = impProcess(rows, map, { origem: origem || 'Migração BEMP', dedup })
    if (!recs.length) { setErr('Nenhum registro válido encontrado (nome/telefone/e-mail vazios).'); setBusy(false); return }

    const payload: ImportRecord[] = recs.map((r) => ({
      nome: r.nome, telefone: r.telefone, email: r.email, documento: r.documento,
      genero: r.genero, ativo: r.ativo, verificado: r.verificado, origem: r.origem,
    }))
    const res = await importarClientes(payload, uni || null)
    setBusy(false)
    if (!res.ok) { setErr(res.error || 'Erro ao gravar no banco.'); return }
    const partes = [`${(res.gravados ?? 0).toLocaleString('pt-BR')} cliente(s) gravados`]
    if (dups) partes.push(`${dups.toLocaleString('pt-BR')} duplicado(s) ignorado(s)`)
    if (genFill) partes.push(`gênero inferido em ${genFill.toLocaleString('pt-BR')}`)
    setInfo(partes.join(' · '))
    router.refresh()
    setTimeout(() => fechar(), 1400)
  }

  const sel: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }
  const sample = rows.slice(0, 3)
  const g = (r: string[], f: ImpField) => (map[f] != null ? (r[map[f]!] || '') : '')

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} title="Importar planilha de clientes">
        <i className="ti ti-file-import" /> Importar
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={fechar}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, padding: 22, background: '#fff', borderRadius: 14, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}><i className="ti ti-file-import" /> Importar clientes</h3>
              <button className="btn btn-ghost" onClick={fechar} aria-label="Fechar"><i className="ti ti-x" /></button>
            </div>

            {/* Dropzone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) lerArquivo(f) }}
              style={{ border: '2px dashed var(--line-strong)', borderRadius: 12, padding: 22, textAlign: 'center', cursor: 'pointer', color: 'var(--text-2)', fontSize: 13.5, background: 'var(--surface-2)' }}
            >
              {fileName
                ? <span><i className="ti ti-file-check" style={{ color: 'var(--green)' }} /> {fileName}</span>
                : <span><i className="ti ti-upload" /> Arraste um arquivo <b>.csv</b> aqui ou clique para selecionar</span>}
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f) }} />

            <div style={{ marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={baixarModelo} style={{ fontSize: 12.5 }}>
                <i className="ti ti-download" /> Baixar modelo de planilha (CSV)
              </button>
            </div>

            {info && <div style={{ marginTop: 12, background: '#E7F0EC', color: '#0f6b3a', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, fontWeight: 600 }}><i className="ti ti-circle-check" /> {info}</div>}
            {err && <div style={{ marginTop: 12, color: 'var(--red)', fontSize: 12.5 }}><i className="ti ti-alert-triangle" /> {err}</div>}

            {/* Mapeamento + prévia */}
            {headers.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                  {MAP_FIELDS.map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ width: 86, color: 'var(--text-2)', fontWeight: 600, textTransform: 'capitalize' }}>{f}</span>
                      <select
                        value={map[f] ?? ''}
                        onChange={(e) => setMap((p) => ({ ...p, [f]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        style={{ ...sel, flex: 1, fontSize: 12 }}
                      >
                        <option value=""> ignorar </option>
                        {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12 }}>
                  <span style={lbl}>Prévia (3 primeiras linhas)</span>
                  <div className="cli-scroll" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
                    <table className="cli-table" style={{ fontSize: 12 }}>
                      <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Documento</th></tr></thead>
                      <tbody>
                        {sample.map((r, i) => (
                          <tr key={i}>
                            <td>{g(r, 'nome') || <span className="muted"></span>}</td>
                            <td>{g(r, 'telefone') || <span className="muted"></span>}</td>
                            <td>{g(r, 'email') || <span className="muted"></span>}</td>
                            <td>{g(r, 'documento') || <span className="muted"></span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Destino: unidade + origem + dedup */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                  <div>
                    <label style={lbl}>Unidade de origem</label>
                    <select style={sel} value={uni} onChange={(e) => setUni(e.target.value)}>
                      <option value=""> Sem unidade </option>
                      {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Origem (quando a planilha não traz)</label>
                    <select style={sel} value={origem} onChange={(e) => setOrigem(e.target.value)}>
                      {ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={dedup} onChange={(e) => setDedup(e.target.checked)} />
                  <span>Remover duplicados (por documento &gt; telefone &gt; nome), mantendo o cadastro mais completo</span>
                </label>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn" onClick={fechar}>Cancelar</button>
              <button className="btn btn-primary" onClick={importar} disabled={busy || !rows.length}>
                <i className="ti ti-database-import" /> {busy ? 'Gravando…' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
