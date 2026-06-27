'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarContrato,
  salvarContrato,
  alternarAtivoContrato,
  urlArquivoContrato,
  type ContratoInput,
} from '@/app/(app)/cadastros/contratos/actions'
import {
  QUANDO_EMITIDO,
  ARQ_ACCEPT,
  termosPadraoPorNome,
  type ContratoRow,
  type QuandoEmitido,
} from '@/lib/contratos'

type Props = {
  modelos: ContratoRow[]
  podeEscrever: boolean
  semTabela: boolean
  filtros: { ativo: string; nome: string }
  kpis: { ativos: number; comArquivo: number }
}

export function ContratosManager({ modelos, podeEscrever, semTabela, filtros, kpis }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<ContratoRow | null>(null)

  async function toggle(r: ContratoRow) {
    setBusy(r.id); setMsg('')
    const res = await alternarAtivoContrato(r.id, r.ativo === false)
    setBusy(null)
    if (!res.ok) setMsg(res.error || 'Erro ao alterar.')
    else router.refresh()
  }

  async function abrirArquivo(r: ContratoRow) {
    setBusy('arq-' + r.id); setMsg('')
    const res = await urlArquivoContrato(r.id)
    setBusy(null)
    if (!res.ok || !res.url) { setMsg(res.error || 'Não foi possível abrir o arquivo.'); return }
    window.open(res.url, '_blank', 'noopener')
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-file-description" /> Modelos de contrato da rede — defina <b>quando o contrato é emitido</b>,
        se é <b>enviado por e-mail para assinatura</b>, o <b>título</b>, os <b>termos</b> e anexe o <b>arquivo</b>
        (PDF/DOC/DOCX) para ficar guardado no sistema e disponível para as unidades.
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Modelos (exibidos)', modelos.length, 'ti-files'],
          ['Ativos (total)', kpis.ativos, 'ti-circle-check'],
          ['Com arquivo anexado', kpis.comArquivo, 'ti-paperclip'],
        ] as [string, number, string][]).map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 20 }}>{val.toLocaleString('pt-BR')}</b>
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {podeEscrever && (
          <button className="btn btn-primary" onClick={() => { setMsg(''); setNovoOpen(true) }}>
            <i className="ti ti-plus" /> Novo
          </button>
        )}
      </div>

      {/* Filtros (form GET) — Ativo (Sim/Não/Todos) + Nome do modelo */}
      <form method="GET" action="/cadastros/contratos" className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-filter flt" /> Filtros</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginTop: 12 }}>
          <div className="field">
            <label>Ativo</label>
            <select name="ativo" defaultValue={filtros.ativo}>
              <option value="Sim">Sim</option>
              <option value="Não">Não</option>
              <option value="Todos">Todos</option>
            </select>
          </div>
          <div className="field">
            <label>Nome do modelo</label>
            <input name="nome" defaultValue={filtros.nome} placeholder="Nome do modelo" />
          </div>
        </div>
        <div className="rel-acts" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary"><i className="ti ti-search" /> Pesquisar</button>
        </div>
      </form>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--red)', margin: '0 0 8px' }}>{msg}</div>}

      {semTabela ? (
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-database-off" style={{ fontSize: 30, display: 'block', marginBottom: 10 }} />
          <b style={{ fontSize: 15, color: 'var(--text-2)' }}>Tabela de modelos de contrato ainda não existe</b>
          <p style={{ fontSize: 12.5, marginTop: 6 }}>
            Aplique a migration <code>scripts/migrations/categorias.sql</code> no lkii para criar a tabela
            <code> contratos_modelo</code> e o seed dos 7 modelos do legado.
          </p>
        </div>
      ) : modelos.length === 0 ? (
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-file-off" style={{ fontSize: 30, display: 'block', marginBottom: 10 }} />
          <b style={{ fontSize: 15, color: 'var(--text-2)' }}>Nenhum modelo encontrado</b>
          <p style={{ fontSize: 12.5, marginTop: 6 }}>Ajuste os filtros{podeEscrever ? ' ou clique em "Novo" para cadastrar o primeiro modelo' : ''}.</p>
        </div>
      ) : (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Nome do modelo</th>
                  <th>Quando o contrato é emitido</th>
                  <th>Enviar por e-mail para assinatura</th>
                  <th>Arquivo</th>
                  <th>Ativo</th>
                  {podeEscrever && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {modelos.map((r) => {
                  const inativo = r.ativo === false
                  return (
                    <tr key={r.id} style={{ opacity: inativo ? 0.55 : 1 }}>
                      <td>
                        <span className="cli-name">
                          <i className="ti ti-file-text" style={{ color: 'var(--brand-500)', marginRight: 7, verticalAlign: -2 }} />
                          {r.nome || '(sem nome)'}
                        </span>
                      </td>
                      <td><span className="orig-tag">{r.quando_emitido || '—'}</span></td>
                      <td>{r.enviar_email !== false ? <span className="pill-yes">Sim</span> : <span className="pill-no">Não</span>}</td>
                      <td>
                        {r.arquivo_path ? (
                          <button className="orig-tag" style={{ background: '#E7F0EC', color: '#0F6B3A', border: 'none', cursor: 'pointer' }}
                            disabled={busy === 'arq-' + r.id} onClick={() => abrirArquivo(r)} title="Abrir arquivo">
                            <i className="ti ti-paperclip" /> {r.arquivo_nome || 'arquivo'}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-3)' }}>—</span>
                        )}
                      </td>
                      <td>{inativo ? <span className="pill-no">Não</span> : <span className="pill-yes">Sim</span>}</td>
                      {podeEscrever && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="os-link" onClick={() => { setMsg(''); setEditRow(r) }} style={{ cursor: 'pointer' }}>
                            <i className="ti ti-edit" /> Editar
                          </span>
                          <span className="os-link" onClick={() => toggle(r)}
                            style={{ cursor: 'pointer', color: inativo ? 'var(--green)' : 'var(--amber)', marginLeft: 12 }}>
                            {busy === r.id ? '…' : (<><i className={`ti ${inativo ? 'ti-rotate-clockwise' : 'ti-ban'}`} /> {inativo ? 'Ativar' : 'Inativar'}</>)}
                          </span>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="cli-foot">
            <span>{modelos.length} registro(s) encontrado(s)</span>
          </div>
        </div>
      )}

      {novoOpen && <ContratoEditor modo="novo" onClose={() => setNovoOpen(false)} onSaved={() => { setNovoOpen(false); router.refresh() }} />}
      {editRow && <ContratoEditor modo="editar" row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); router.refresh() }} />}
    </div>
  )
}

// ─────────────────── Editor (view-contrato-editor do legado) ───────────────────

function ContratoEditor({ modo, row, onClose, onSaved }: {
  modo: 'novo' | 'editar'
  row?: ContratoRow
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({
    nome: row?.nome ?? '',
    quando_emitido: (QUANDO_EMITIDO.includes(row?.quando_emitido as QuandoEmitido) ? (row!.quando_emitido as QuandoEmitido) : 'Planos de Assinatura') as QuandoEmitido,
    enviar_email: row?.enviar_email !== false,
    todas_unidades: row?.todas_unidades !== false,
    titulo: row?.titulo ?? '',
    // Legado: openContratoEditor preenche o textarea com CONTRATO_TXT[cid] ou nota.
    termos: row?.termos ?? termosPadraoPorNome(row?.nome) ??
      'Conteúdo deste modelo ainda não importado. Informe o link da página de edição para copiarmos o texto completo.',
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const [arqData, setArqData] = useState<string | null>(null)
  const [arqNome, setArqNome] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(false)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) { setArqData(null); setArqNome(''); return }
    if (file.size > 10 * 1024 * 1024) { setErr('Arquivo muito grande (máx. 10 MB).'); e.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = () => { setArqData(typeof reader.result === 'string' ? reader.result : null); setArqNome(file.name); setErr('') }
    reader.onerror = () => setErr('Falha ao ler o arquivo.')
    reader.readAsDataURL(file)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.nome.trim()) { setErr('Informe o nome do modelo.'); return }
    if (!f.termos.trim()) { setErr('Os termos do contrato são obrigatórios.'); return }

    const input: ContratoInput = {
      nome: f.nome.trim(),
      quando_emitido: f.quando_emitido,
      enviar_email: f.enviar_email,
      todas_unidades: f.todas_unidades,
      titulo: f.titulo.trim() || null,
      termos: f.termos,
      arquivo_data: arqData,
      arquivo_nome: arqNome || null,
    }
    setSaving(true)
    const res = modo === 'novo' ? await criarContrato(input) : await salvarContrato(row!.id, input)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    onSaved()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong, var(--line))', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflow: 'auto' }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 760, margin: '24px 0', padding: 22, background: '#fff', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <h3 style={{ fontSize: 18, marginBottom: 16, fontWeight: 700 }}>
          <i className="ti ti-edit" /> {modo === 'novo' ? 'Novo modelo de contrato' : 'Editar modelo de contrato'}
        </h3>

        {/* Dados básicos (4 campos do legado) */}
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--brand-600)', margin: '0 0 10px' }}>
          <i className="ti ti-file-description" /> Dados básicos
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Nome do modelo <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={inp} value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus placeholder="Ex.: Contrato Laser&Club - Plano Bronze" />
          </div>
          <div>
            <label style={lbl}>Quando o contrato é emitido</label>
            <select style={inp} value={f.quando_emitido} onChange={(e) => set('quando_emitido', e.target.value as QuandoEmitido)}>
              {QUANDO_EMITIDO.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Enviar por e-mail para assinatura</label>
            <select style={inp} value={f.enviar_email ? '1' : '0'} onChange={(e) => set('enviar_email', e.target.value === '1')}>
              <option value="1">Sim</option>
              <option value="0">Não</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Habilitado para todas as unidades</label>
            <select style={inp} value={f.todas_unidades ? '1' : '0'} onChange={(e) => set('todas_unidades', e.target.value === '1')}>
              <option value="1">Sim</option>
              <option value="0">Não</option>
            </select>
          </div>
        </div>

        {/* Conteúdo do contrato */}
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--brand-600)', margin: '0 0 10px' }}>
          <i className="ti ti-file-text" /> Conteúdo do contrato
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Título do contrato</label>
          <input style={inp} value={f.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Título exibido no contrato" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={lbl}>Termos do contrato (obrigatório) <span style={{ color: 'var(--red)' }}>*</span></label>
          <textarea style={{ ...inp, minHeight: 320, lineHeight: 1.6, fontSize: 12.5, resize: 'vertical' }} value={f.termos} onChange={(e) => set('termos', e.target.value)} />
        </div>

        {/* Arquivo do modelo (anexar) */}
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--brand-600)', margin: '0 0 8px' }}>
          <i className="ti ti-paperclip" /> Arquivo do modelo (anexar)
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-2)', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          <i className="ti ti-info-circle" /> Anexe o arquivo do contrato (PDF/DOC/DOCX) para ficar <b>guardado no sistema</b> e disponível para as <b>unidades</b> usarem.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <input type="file" accept={ARQ_ACCEPT} onChange={onFile} />
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            {arqNome
              ? `Novo: ${arqNome}`
              : row?.arquivo_nome
                ? `Arquivo atual: ${row.arquivo_nome}`
                : 'Nenhum arquivo anexado'}
          </span>
        </div>

        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-arrow-left" /> Voltar</button>
          <button type="button" className="btn" onClick={() => setPreview(true)}><i className="ti ti-eye" /> Pré-visualizar</button>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginLeft: 'auto' }}>
            {saving ? 'Salvando…' : (<><i className="ti ti-device-floppy" /> Salvar modelo de contrato</>)}
          </button>
        </div>
      </form>

      {/* Pré-visualização (legado: contPreview — renderiza título + termos) */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 110, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflow: 'auto' }} onClick={() => setPreview(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, margin: '24px 0', padding: 28, background: '#fff', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <b style={{ fontSize: 15 }}><i className="ti ti-eye" /> Pré-visualização</b>
              <button type="button" className="btn" onClick={() => setPreview(false)}><i className="ti ti-x" /></button>
            </div>
            <h2 style={{ fontSize: 17, textAlign: 'center', marginBottom: 18 }}>{f.titulo || f.nome}</h2>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-2)' }}>{f.termos}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
