'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  criarDocumento,
  salvarDocumento,
  toggleDocumentoStatus,
  type DocumentoInput,
} from '@/app/(app)/cadastros/anamnese/actions'
import {
  TIPOS_CAMPO,
  TIPOS_DOCUMENTO,
  PREENCHIMENTOS,
  acumulativoHint,
  resumoDocumento,
  rotuloUnidades,
  type Campo,
  type Secao,
  type StatusDoc,
  type TipoCampo,
} from '@/lib/anamnese'
import { dataBR } from '@/lib/fmt'

type Unidade = { id: string; nome: string }

export type DocViewRow = {
  id: string
  nome: string | null
  tipo: string | null
  descricao: string | null
  preenchimento: string | null
  obrigatorio: boolean | null
  status: string | null
  acumulativo: boolean | null
  unidades_ids: string[] | null
  secoes: Secao[]
  atualizado_em: string | null
}

type Props = {
  documentos: DocViewRow[]
  unidades: Unidade[]
  podeEscrever: boolean
  semTabela: boolean
  filtros: { q: string; ativo: string }
}

function statusClass(status: string | null): string {
  if (status === 'Ativo') return 'os-fechada'
  if (status === 'Rascunho') return 'os-aberta'
  return 'os-inativo'
}

export function AnamneseManager({ documentos, unidades, podeEscrever, semTabela, filtros }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  // null = lista; 'novo' = editor em branco; row = editor com documento.
  const [editor, setEditor] = useState<DocViewRow | 'novo' | null>(null)

  async function toggle(d: DocViewRow) {
    setBusy(d.id); setMsg('')
    const res = await toggleDocumentoStatus(d.id, d.status === 'Inativo')
    setBusy(null)
    if (!res.ok) setMsg(res.error || 'Erro.')
    else router.refresh()
  }

  const nomesPorId = Object.fromEntries(unidades.map((u) => [u.id, u.nome]))

  const temFiltro = !!filtros.q || !!filtros.ativo
  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    const s = p.toString()
    router.push(`/cadastros/anamnese${s ? `?${s}` : ''}`)
  }

  if (editor) {
    return (
      <DocEditor
        doc={editor === 'novo' ? null : editor}
        unidades={unidades}
        podeEscrever={podeEscrever}
        onBack={() => setEditor(null)}
        onSaved={() => { setEditor(null); router.refresh() }}
      />
    )
  }

  return (
    <div className="view active">
      <p style={{ color: 'var(--text-2)', fontSize: 13.5, marginBottom: 16 }}>
        Documentos e fichas digitais disponíveis no cadastro de cada cliente para preenchimento. Defina quais unidades
        têm acesso a cada documento.
      </p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {podeEscrever && (
          <button className="btn btn-primary" onClick={() => { setMsg(''); setEditor('novo') }}>
            <i className="ti ti-plus" /> Novo documento
          </button>
        )}
      </div>

      {!semTabela && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 14px' }}>
          <input
            defaultValue={filtros.q}
            placeholder="🔎 Nome do documento..."
            onKeyDown={(e) => { if (e.key === 'Enter') setParams({ q: (e.target as HTMLInputElement).value }) }}
            style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 260 }}
          />
          <select value={filtros.ativo} onChange={(e) => setParams({ ativo: e.target.value })} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }} title="Ativo">
            <option value="">Todos</option>
            <option value="sim">Ativos</option>
            <option value="nao">Inativos</option>
          </select>
          {temFiltro && (
            <button className="btn" onClick={() => router.push('/cadastros/anamnese')}><i className="ti ti-x" /> Limpar</button>
          )}
        </div>
      )}

      {msg && <div style={{ fontSize: 12.5, color: 'var(--red)', margin: '0 0 8px' }}>{msg}</div>}

      {semTabela ? (
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-database-off" style={{ fontSize: 30, display: 'block', marginBottom: 10 }} />
          <b style={{ fontSize: 15, color: 'var(--text-2)' }}>Tabela de documentos não encontrada</b>
          <p style={{ fontSize: 12.5, marginTop: 6 }}>
            Aplique a migration <code>scripts/migrations/anamnese.sql</code> no lkii para criar a tabela e o seed dos 8 documentos
            (Anamnese, Termo de Sessão, Autorização para Menor, Uso de Imagem, Cancelamento, Transferência, Crédito, Pós-Laser).
          </p>
        </div>
      ) : (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Tipo</th>
                  <th>Unidades com acesso</th>
                  <th>Obrigatório</th>
                  <th>Status</th>
                  <th>Atualizado</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {documentos.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                      {temFiltro ? 'Nenhum documento encontrado para os filtros selecionados.' : 'Nenhum documento cadastrado. Use “Novo documento” para criar o primeiro.'}
                    </td>
                  </tr>
                )}
                {documentos.map((d) => {
                  const inativo = d.status === 'Inativo'
                  const { perguntas, inviabiliza } = resumoDocumento(d.secoes)
                  return (
                    <tr key={d.id} style={{ opacity: inativo ? 0.55 : 1 }}>
                      <td>
                        <span className="cli-name">
                          <i className="ti ti-file-text" style={{ color: 'var(--brand-500)', marginRight: 7, verticalAlign: -2 }} />
                          {d.nome}
                        </span>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {perguntas} pergunta(s){inviabiliza > 0 ? ` · ${inviabiliza} inviabiliza serviço(s)` : ''}
                          {d.acumulativo ? ' · acumulativo' : ''}
                        </div>
                      </td>
                      <td><span className="orig-tag">{d.tipo}</span></td>
                      <td style={{ whiteSpace: 'normal', maxWidth: 260, color: 'var(--text-2)' }}>
                        {rotuloUnidades(d.unidades_ids, nomesPorId)}
                      </td>
                      <td>{d.obrigatorio ? <span className="pill-yes">Sim</span> : <span className="pill-no">Não</span>}</td>
                      <td><span className={`os-st ${statusClass(d.status)}`}>{d.status}</span></td>
                      <td>{dataBR(d.atualizado_em) || ''}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="os-link" style={{ cursor: 'pointer' }} onClick={() => { setMsg(''); setEditor(d) }}>
                          <i className="ti ti-edit" /> {podeEscrever ? 'Editar' : 'Ver'}
                        </span>
                        {podeEscrever && (
                          <span className="os-link" style={{ cursor: 'pointer', color: inativo ? 'var(--green)' : 'var(--red)', marginLeft: 14, opacity: busy === d.id ? 0.5 : 1 }} onClick={() => busy !== d.id && toggle(d)}>
                            <i className={`ti ${inativo ? 'ti-rotate-clockwise' : 'ti-ban'}`} /> {inativo ? 'Ativar' : 'Inativar'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="cli-foot"><span>{documentos.length} documento(s)</span></div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────── Editor (construtor de documento) ───────────────────────────

const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }

function DocEditor({ doc, unidades, podeEscrever, onBack, onSaved }: {
  doc: DocViewRow | null
  unidades: Unidade[]
  podeEscrever: boolean
  onBack: () => void
  onSaved: () => void
}) {
  const [nome, setNome] = useState(doc?.nome ?? '')
  const [tipo, setTipo] = useState(doc?.tipo && TIPOS_DOCUMENTO.includes(doc.tipo as never) ? doc.tipo : 'Anamnese')
  const [descricao, setDescricao] = useState(doc?.descricao ?? '')
  const [preenchimento, setPreenchimento] = useState(
    doc?.preenchimento && PREENCHIMENTOS.includes(doc.preenchimento as never) ? doc.preenchimento : PREENCHIMENTOS[0],
  )
  const [obrigatorio, setObrigatorio] = useState(doc?.obrigatorio ?? false)
  const [acumulativo, setAcumulativo] = useState(doc?.acumulativo ?? false)
  // unidades selecionadas. doc.unidades_ids null/[] = todas (todas marcadas).
  const [unidadesIds, setUnidadesIds] = useState<string[]>(() => {
    if (doc?.unidades_ids && doc.unidades_ids.length) return doc.unidades_ids
    return unidades.map((u) => u.id) // todas marcadas por padrão
  })
  const [secoes, setSecoes] = useState<Secao[]>(() =>
    doc?.secoes && doc.secoes.length
      ? doc.secoes.map((s) => ({ titulo: s.titulo, campos: s.campos.map((c) => ({ ...c })) }))
      : [{ titulo: 'NOVA SEÇÃO', campos: [{ q: '', t: 'simnao' as TipoCampo }] }],
  )

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const todasMarcadas = unidades.length > 0 && unidadesIds.length === unidades.length

  function toggleUnidade(id: string) {
    setUnidadesIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }
  function toggleTodas(checked: boolean) {
    setUnidadesIds(checked ? unidades.map((u) => u.id) : [])
  }

  // ── Operações no construtor de seções/campos ──
  function setSecaoTitulo(si: number, titulo: string) {
    setSecoes((p) => p.map((s, i) => (i === si ? { ...s, titulo } : s)))
  }
  function removerSecao(si: number) {
    setSecoes((p) => p.filter((_, i) => i !== si))
  }
  function addSecao() {
    setSecoes((p) => [...p, { titulo: 'NOVA SEÇÃO', campos: [{ q: '', t: 'simnao' }] }])
  }
  function addCampo(si: number) {
    setSecoes((p) => p.map((s, i) => (i === si ? { ...s, campos: [...s.campos, { q: '', t: 'simnao' }] } : s)))
  }
  function removerCampo(si: number, ci: number) {
    setSecoes((p) => p.map((s, i) => (i === si ? { ...s, campos: s.campos.filter((_, k) => k !== ci) } : s)))
  }
  function setCampo(si: number, ci: number, patch: Partial<Campo>) {
    setSecoes((p) => p.map((s, i) => (i === si ? { ...s, campos: s.campos.map((c, k) => (k === ci ? { ...c, ...patch } : c)) } : s)))
  }

  async function salvar(status: StatusDoc) {
    setErr('')
    if (!nome.trim()) { setErr('Informe o nome do documento.'); return }
    const input: DocumentoInput = {
      nome: nome.trim(),
      tipo,
      descricao,
      preenchimento,
      obrigatorio,
      status,
      acumulativo,
      // [] = todas as unidades da rede (legado: checkbox "Todas as unidades").
      unidades_ids: todasMarcadas ? [] : unidadesIds,
      secoes,
    }
    setSaving(true)
    const res = doc ? await salvarDocumento(doc.id, input) : await criarDocumento(input)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    onSaved()
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 18, marginBottom: 14 }

  return (
    <div className="view active">
      <span className="os-link" style={{ cursor: 'pointer', display: 'inline-block', marginBottom: 12 }} onClick={onBack}>
        <i className="ti ti-arrow-left" /> Voltar aos documentos
      </span>

      {/* Dados do documento */}
      <div style={card}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}><i className="ti ti-file-description" /> Dados do documento</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Nome do documento</label><input style={inp} value={nome} disabled={!podeEscrever} onChange={(e) => setNome(e.target.value)} /></div>
          <div>
            <label style={lbl}>Tipo</label>
            <select style={inp} value={tipo} disabled={!podeEscrever} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Descrição</label><input style={inp} value={descricao} disabled={!podeEscrever} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição / instruções do documento" /></div>
          <div>
            <label style={lbl}>Preenchimento</label>
            <select style={inp} value={preenchimento} disabled={!podeEscrever} onChange={(e) => setPreenchimento(e.target.value)}>
              {PREENCHIMENTOS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Obrigatório</label>
            <select style={inp} value={obrigatorio ? '1' : '0'} disabled={!podeEscrever} onChange={(e) => setObrigatorio(e.target.value === '1')}>
              <option value="1">Sim</option>
              <option value="0">Não</option>
            </select>
          </div>
        </div>
      </div>

      {/* Unidades com acesso */}
      <div style={card}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}><i className="ti ti-building-store" /> Unidades com acesso</h3>
        {unidades.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Nenhuma unidade disponível para o seu acesso.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
            <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--brand-300)', borderRadius: 9, background: '#F7E7EB', fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={todasMarcadas} disabled={!podeEscrever} onChange={(e) => toggleTodas(e.target.checked)} />
              Todas as unidades da rede
            </label>
            {unidades.map((u) => (
              <label key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13 }}>
                <input type="checkbox" checked={unidadesIds.includes(u.id)} disabled={!podeEscrever} onChange={() => toggleUnidade(u.id)} />
                {u.nome}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Comportamento do documento (acumulativo) */}
      <div style={card}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}><i className="ti ti-refresh" /> Comportamento do documento</h3>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={acumulativo} disabled={!podeEscrever} onChange={(e) => setAcumulativo(e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            <b>Documento acumulativo de sessões</b>  em vez de um termo por sessão, reabre o mesmo documento e registra cada nova sessão (o que foi feito, evolução, novas fotos e assinaturas do cliente e do profissional).
          </span>
        </label>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 10 }}>{acumulativoHint(acumulativo)}</p>
      </div>

      {/* Construtor de seções/perguntas */}
      {secoes.map((s, si) => (
        <div key={si} style={card}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <i className="ti ti-layout-list" style={{ color: 'var(--brand-500)' }} />
            <input style={{ ...inp, fontWeight: 600 }} value={s.titulo} disabled={!podeEscrever} onChange={(e) => setSecaoTitulo(si, e.target.value)} />
            {podeEscrever && (
              <button className="btn" title="Remover seção" style={{ color: 'var(--red)', flexShrink: 0 }} onClick={() => removerSecao(si)}>
                <i className="ti ti-trash" />
              </button>
            )}
          </div>
          <div>
            {s.campos.map((c, ci) => (
              <div key={ci} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <input style={{ ...inp, flex: '1 1 220px' }} value={c.q} disabled={!podeEscrever} placeholder="Pergunta" onChange={(e) => setCampo(si, ci, { q: e.target.value })} />
                <select style={{ ...inp, width: 'auto', flex: '0 0 auto' }} value={c.t} disabled={!podeEscrever} onChange={(e) => setCampo(si, ci, { t: e.target.value as TipoCampo })}>
                  {TIPOS_CAMPO.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                  <input type="checkbox" checked={!!c.obr} disabled={!podeEscrever} onChange={(e) => setCampo(si, ci, { obr: e.target.checked })} /> Obrig.
                </label>
                <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0, color: c.inv ? 'var(--red)' : 'var(--text-2)' }} title="Respondida positivamente, inviabiliza os serviços">
                  <input type="checkbox" checked={!!c.inv} disabled={!podeEscrever} onChange={(e) => setCampo(si, ci, { inv: e.target.checked })} /> Inviabiliza
                </label>
                {podeEscrever && (
                  <button className="btn" title="Remover pergunta" style={{ color: 'var(--red)', flexShrink: 0 }} onClick={() => removerCampo(si, ci)}>
                    <i className="ti ti-trash" />
                  </button>
                )}
              </div>
            ))}
            {podeEscrever && (
              <span className="os-link" style={{ cursor: 'pointer' }} onClick={() => addCampo(si)}>
                <i className="ti ti-plus" /> Adicionar pergunta
              </span>
            )}
          </div>
        </div>
      ))}

      {err && <p style={{ color: 'var(--red)', fontSize: 12.5, margin: '0 0 8px' }}>{err}</p>}

      {/* Barra de ações */}
      <div style={{ display: 'flex', gap: 10, margin: '6px 0 28px', flexWrap: 'wrap' }}>
        {podeEscrever && <button className="btn" onClick={addSecao}><i className="ti ti-plus" /> Adicionar seção</button>}
        {podeEscrever && doc && (
          <button className="btn" style={{ marginLeft: 'auto', color: 'var(--red)', borderColor: '#E7B7BC' }} disabled={saving} onClick={() => salvar('Inativo')}>
            <i className="ti ti-ban" /> Inativar documento
          </button>
        )}
        {podeEscrever && (
          <button className="btn" style={{ marginLeft: doc ? undefined : 'auto' }} disabled={saving} onClick={() => salvar('Rascunho')}>
            <i className="ti ti-device-floppy" /> Salvar como rascunho
          </button>
        )}
        {podeEscrever && (
          <button className="btn btn-primary" disabled={saving} onClick={() => salvar('Ativo')}>
            <i className="ti ti-device-floppy" /> {saving ? 'Salvando…' : 'Salvar e disponibilizar'}
          </button>
        )}
      </div>
    </div>
  )
}
