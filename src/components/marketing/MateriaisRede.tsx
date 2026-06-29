'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { publicarNoticia } from '@/app/(app)/marketing/actions'
import { mktFileIcon, dataRefBR, type MktTab } from '@/lib/marketing'

// ── Tipos vindos das tabelas mkt_* (migration scripts/migrations/marketing.sql) ──
export type MaterialNode = { id: string; parent_id: string | null; kind: 'pasta' | 'arquivo' | string; nome: string; link_url: string | null; ordem: number | null }
export type AtualizacaoRow = { id: string; data_ref: string; tipo: string; descricao: string; onde: string | null; novo: boolean }
export type NoticiaRow = { id: string; data_ref: string; titulo: string; resumo: string | null; autor: string }

type Props = {
  tab: MktTab
  isAdmin: boolean
  atualizacoes: AtualizacaoRow[]
  noticias: NoticiaRow[]
  materiais: MaterialNode[]
  onIrParaMateriais: (onde: string | null) => void
  /** caminho atual no navegador de materiais (ids das pastas) */
  path: string[]
  setPath: (p: string[]) => void
}

/** Renderiza as 3 abas do legado buildMarketing (Atualizações / Materiais / Notícias). */
export function MateriaisRede(props: Props) {
  const { tab, isAdmin, atualizacoes, noticias, materiais, onIrParaMateriais, path, setPath } = props
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [resumo, setResumo] = useState('')

  // Índices da árvore de materiais.
  const byParent = useMemo(() => {
    const m = new Map<string | null, MaterialNode[]>()
    for (const n of materiais) {
      const k = n.parent_id ?? null
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(n)
    }
    return m
  }, [materiais])
  const byId = useMemo(() => new Map(materiais.map((n) => [n.id, n])), [materiais])

  const naoLidos = atualizacoes.filter((u) => u.novo).length

  // ─────────────── ABA: Atualizações da rede (8376-8382) ───────────────
  if (tab === 'atualizacoes') {
    return (
      <>
        {naoLidos > 0 ? (
          <div className="rel-legend" style={{ background: 'var(--brand-50, #F7E7EB)', border: '1px solid var(--brand-400, var(--line))', marginBottom: 14 }}>
            <i className="ti ti-sparkles" /> <b>{naoLidos} novo(s) material(is)</b> publicado(s) pela rede desde a sua última visita. Veja abaixo o que mudou e onde encontrar.
          </div>
        ) : (
          <div className="rel-legend" style={{ background: 'var(--green-bg, #E9F3EC)', border: '1px solid var(--green)', marginBottom: 14 }}>
            <i className="ti ti-check" /> Você está em dia com os materiais da rede.
          </div>
        )}
        {atualizacoes.length === 0 ? (
          <div className="rel-card" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 34 }}>
            <i className="ti ti-bell-off" style={{ fontSize: 28 }} /><p style={{ marginTop: 8 }}>Nenhuma atualização publicada ainda.</p>
          </div>
        ) : (
          <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}><span><i className="ti ti-history" /> Últimas atualizações da rede</span></div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead><tr><th>Data</th><th>Tipo</th><th>O que é</th><th>Onde está</th><th>Ação</th></tr></thead>
                <tbody>
                  {atualizacoes.map((u) => (
                    <tr key={u.id}>
                      <td>{dataRefBR(u.data_ref)}</td>
                      <td><span className="os-st os-andamento">{u.tipo}</span></td>
                      <td><b>{u.descricao}</b>{u.novo && <span className="os-st os-cancelada" style={{ fontSize: 10, marginLeft: 6 }}>NOVO</span>}</td>
                      <td style={{ color: 'var(--text-2)' }}><i className="ti ti-folder" style={{ color: 'var(--gold-600, var(--amber))' }} /> {u.onde || '—'}</td>
                      <td>
                        <button className="btn btn-ghost" style={{ padding: '3px 9px' }} onClick={() => onIrParaMateriais(u.onde)}>
                          <i className="ti ti-arrow-right" /> Abrir pasta
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    )
  }

  // ─────────────── ABA: Notícias (8383-8388) ───────────────
  if (tab === 'noticias') {
    async function onPublicar() {
      setBusy(true); setMsg('')
      const r = await publicarNoticia({ titulo, resumo })
      setBusy(false)
      if (!r.ok) { setMsg(r.error || 'Erro ao publicar.'); return }
      setTitulo(''); setResumo(''); setForm(false); router.refresh()
    }
    return (
      <>
        <div className="rel-legend">Notícias, matérias e divulgações da rede para os franqueados e equipes.</div>
        {msg && <div className="rel-legend" style={{ borderColor: 'var(--red)', color: 'var(--red)', marginBottom: 10 }}><i className="ti ti-alert-triangle" /> {msg}</div>}
        {isAdmin && !form && (
          <div className="rel-acts" style={{ marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => setForm(true)}><i className="ti ti-plus" /> Publicar notícia</button>
          </div>
        )}
        {isAdmin && form && (
          <div className="rel-card" style={{ marginBottom: 12 }}>
            <div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-news" /> Publicar notícia da rede</span></div>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título da notícia / divulgação" maxLength={200}
                style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
              <textarea value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Resumo / texto da matéria" rows={4}
                style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => { setForm(false); setMsg('') }} disabled={busy}>Cancelar</button>
                <button className="btn btn-primary" onClick={onPublicar} disabled={busy || !titulo.trim()}><i className="ti ti-send" /> {busy ? 'Publicando…' : 'Publicar'}</button>
              </div>
            </div>
          </div>
        )}
        {noticias.length === 0 ? (
          <div className="rel-card" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 34 }}>
            <i className="ti ti-news-off" style={{ fontSize: 28 }} /><p style={{ marginTop: 8 }}>Nenhuma notícia publicada ainda.</p>
          </div>
        ) : noticias.map((nw) => (
          <div key={nw.id} className="rel-card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}><i className="ti ti-calendar" /> {dataRefBR(nw.data_ref)} · {nw.autor}</span>
            </div>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>{nw.titulo}</h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{nw.resumo}</p>
          </div>
        ))}
      </>
    )
  }

  // ─────────────── ABA: Materiais (navegador de pastas) (8389-8402) ───────────────
  const cur = path.length ? path[path.length - 1] : null
  const subs = (byParent.get(cur) ?? [])
  const pastas = subs.filter((n) => n.kind !== 'arquivo')
  const arquivos = subs.filter((n) => n.kind === 'arquivo')

  // Breadcrumb: "Materiais › Pasta A › Pasta B"
  const crumbs = path.map((id) => byId.get(id)).filter(Boolean) as MaterialNode[]

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, marginBottom: 12 }}>
        <span className="os-link" onClick={() => setPath([])} style={{ cursor: 'pointer' }}><i className="ti ti-folders" /> Materiais</span>
        {crumbs.map((c, i) => (
          <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-chevron-right" style={{ fontSize: 13, color: 'var(--text-3)' }} />
            <span className="os-link" onClick={() => setPath(path.slice(0, i + 1))} style={{ cursor: 'pointer' }}>{c.nome}</span>
          </span>
        ))}
      </div>

      {pastas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
          {pastas.map((s) => {
            const children = byParent.get(s.id) ?? []
            const isLeaf = children.length > 0 && children.every((c) => c.kind === 'arquivo')
            const cnt = children.length
            return (
              <div key={s.id} onClick={() => setPath([...path, s.id])} style={{ cursor: 'pointer', border: '1px solid var(--line)', borderRadius: 12, padding: 16, background: 'var(--surface)', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--gold-soft, var(--surface-2))', color: 'var(--gold-600, var(--amber))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  <i className={`ti ti-${isLeaf ? 'folder-open' : 'folder'}`} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.nome}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{isLeaf ? `${cnt} arquivo(s)` : `${cnt} pasta(s)`}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {arquivos.length > 0 && (
        <>
          <div className="rel-card-h" style={{ padding: '14px 2px', cursor: 'default' }}><span><i className="ti ti-files" /> Arquivos nesta pasta</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
            {arquivos.map((f) => {
              const { icon, canva } = mktFileIcon(f.nome)
              // Só abre quando há fonte real (link_url). Materiais binários não têm
              // storage no backend ainda → botão desabilitado (sem fingir download).
              const temArquivo = !!f.link_url
              const baixar = () => {
                if (!temArquivo) return
                // Legado mktBaixar (8357): só admin baixa; demais visualizam.
                if (!isAdmin) { setMsg('Download liberado pelo administrador. Material visível para uso da unidade.'); setTimeout(() => setMsg(''), 3000); return }
                window.open(f.link_url!, '_blank')
              }
              return (
                <div key={f.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 13, background: 'var(--surface)', display: 'flex', gap: 11, alignItems: 'center' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>
                    <i className={`ti ti-${icon}`} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nome}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ padding: '4px 9px' }} onClick={baixar} disabled={!temArquivo} title={temArquivo ? (canva ? 'Abrir' : 'Baixar') : 'Sem arquivo disponível para download'}>
                    <i className={`ti ti-${!temArquivo ? 'file-off' : canva ? 'external-link' : 'download'}`} />
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {pastas.length === 0 && arquivos.length === 0 && (
        <div className="rel-card" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 30 }}>Pasta vazia.</div>
      )}

      {msg && <div className="rel-legend" style={{ marginTop: 12 }}><i className="ti ti-info-circle" /> {msg}</div>}
    </>
  )
}
