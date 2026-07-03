'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  novaPasta, excluirPasta, uploadArquivo, urlArquivo, excluirArquivo,
  vincularDrive, desvincularDrive, importarDrive,
} from '@/app/(app)/disco/actions'
import { discoFmt, discoIco } from '@/lib/marketing'
import { dataBR } from '@/lib/fmt'

export type DiscoPasta = { id: string; parent_id: string | null; nome: string; por: string; drive: boolean; criado_em: string | null }
export type DiscoArquivo = { id: string; pasta_id: string | null; nome: string; tipo: string | null; bytes: number; arquivo_path: string | null; por: string; drive: boolean; criado_em: string | null }

type Props = {
  isAdmin: boolean
  migrationPendente: boolean
  driveLinked: boolean
  driveUrl: string | null
  pastas: DiscoPasta[]
  arquivos: DiscoArquivo[]
}

/** Lê um File como data URI base64 (input file -> data URI, igual ao legado contratos). */
function lerArquivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('Falha ao ler arquivo.'))
    fr.readAsDataURL(file)
  })
}

/** DISCO VIRTUAL  gerenciador de arquivos da rede (paridade buildDisco ~9417). */
export function DiscoManager(props: Props) {
  const { isAdmin, migrationPendente, driveLinked, driveUrl, pastas, arquivos } = props
  const router = useRouter()
  const [cur, setCur] = useState<string | null>(null) // pasta atual (null = raiz)
  const [busca, setBusca] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(''), 3500) }

  // Breadcrumb da pasta atual (discoPath, 9407).
  const byId = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas])
  const path = useMemo(() => {
    const out: DiscoPasta[] = []
    let id = cur
    while (id) { const f = byId.get(id); if (!f) break; out.unshift(f); id = f.parent_id }
    return out
  }, [cur, byId])

  // Subpastas e arquivos da pasta atual, com busca (discoBusca, 9416).
  const q = busca.trim().toLowerCase()
  let subs = pastas.filter((p) => p.parent_id === cur)
  let files = arquivos.filter((a) => a.pasta_id === cur)
  if (q) {
    subs = subs.filter((p) => p.nome.toLowerCase().includes(q))
    files = files.filter((a) => a.nome.toLowerCase().includes(q))
  }

  // Contagem de itens por pasta (9437).
  const itensDe = (id: string) => arquivos.filter((a) => a.pasta_id === id).length + pastas.filter((p) => p.parent_id === id).length

  async function onNovaPasta() {
    const nome = window.prompt('Nome da nova pasta:')
    if (!nome) return
    setBusy(true)
    const r = await novaPasta({ nome, parentId: cur })
    setBusy(false)
    if (!r.ok) flash(r.error || 'Erro.'); else router.refresh()
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files
    if (!fl || !fl.length) return
    setBusy(true); setMsg('')
    let ok = 0
    for (const f of Array.from(fl)) {
      try {
        const data = await lerArquivo(f)
        const r = await uploadArquivo({ pastaId: cur, arquivo_data: data, arquivo_nome: f.name })
        if (r.ok) ok++; else { flash(r.error || 'Falha no upload.'); break }
      } catch { flash('Falha ao ler arquivo.'); break }
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
    if (ok) { flash(`${ok} arquivo(s) enviado(s)${driveLinked ? ' e replicado(s) no Drive' : ''}.`); router.refresh() }
  }

  async function onBaixar(id: string) {
    const r = await urlArquivo(id)
    if (!r.ok || !r.url) { flash(r.error || 'Não foi possível baixar.'); return }
    window.open(r.url, '_blank')
  }

  async function onExcluirArq(a: DiscoArquivo) {
    if (!window.confirm(`Excluir "${a.nome}"?`)) return
    setBusy(true)
    const r = await excluirArquivo(a.id)
    setBusy(false)
    if (!r.ok) flash(r.error || 'Erro.'); else router.refresh()
  }

  async function onExcluirPasta(p: DiscoPasta) {
    if (!window.confirm(`Excluir a pasta "${p.nome}" e todo o seu conteúdo?`)) return
    setBusy(true)
    const r = await excluirPasta(p.id)
    setBusy(false)
    if (!r.ok) flash(r.error || 'Erro.'); else { if (cur === p.id) setCur(p.parent_id); router.refresh() }
  }

  async function onVincular() {
    const u = window.prompt('Cole o link da pasta compartilhada do Google Drive (raiz do Disco Virtual):', driveUrl || 'https://drive.google.com/drive/folders/')
    if (u === null) return
    setBusy(true)
    const r = await vincularDrive(u)
    setBusy(false)
    if (!r.ok) flash(r.error || 'Erro.'); else { flash('Google Drive vinculado  pastas e uploads serão replicados.'); router.refresh() }
  }

  async function onDesvincular() {
    if (!window.confirm('Desvincular o Google Drive? As pastas locais permanecem.')) return
    setBusy(true)
    const r = await desvincularDrive()
    setBusy(false)
    if (!r.ok) flash(r.error || 'Erro.'); else router.refresh()
  }

  async function onImportar() {
    setBusy(true)
    const r = await importarDrive()
    setBusy(false)
    if (!r.ok) flash(r.error || 'Erro.'); else { flash('Pastas do Google Drive importadas e replicadas.'); router.refresh() }
  }

  return (
    <>
      {migrationPendente && (
        <div className="rel-legend" style={{ background: 'var(--amber-bg, #FFF7E6)', border: '1px solid var(--amber)', marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" /> Aplique a migration <b>scripts/migrations/marketing.sql</b> no lkii (e crie o bucket de Storage <b>disco-virtual</b>) para ativar o Disco Virtual.
        </div>
      )}

      {msg && <div className="rel-legend" style={{ marginBottom: 10 }}><i className="ti ti-info-circle" /> {msg}</div>}

      {/* Banner do Google Drive */}
      {driveLinked ? (
        <div className="rel-card" style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', background: 'var(--green-bg, #E9F3EC)', border: '1px solid var(--green)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="ti ti-brand-google-drive" style={{ fontSize: 22, color: 'var(--green)' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Conectado ao Google Drive</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driveUrl} · pastas e uploads são replicados</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {driveUrl && <button className="btn btn-ghost" onClick={() => window.open(driveUrl, '_blank')}><i className="ti ti-external-link" /> Abrir no Drive</button>}
            {isAdmin && <button className="btn btn-ghost" onClick={onImportar} disabled={busy}><i className="ti ti-cloud-download" /> Importar pastas</button>}
            {isAdmin && <button className="btn btn-ghost" onClick={onDesvincular} disabled={busy}><i className="ti ti-unlink" /> Desvincular</button>}
          </div>
        </div>
      ) : isAdmin && (
        <div className="rel-card" style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="ti ti-brand-google-drive" style={{ fontSize: 22, color: 'var(--text-3)' }} />
            <div style={{ fontSize: 13 }}><b>Vincular um Google Drive</b> (opcional)  use uma pasta compartilhada do Drive como raiz; as pastas/arquivos de lá são replicados no Disco Virtual. Ou crie pastas e faça upload direto aqui.</div>
          </div>
          <button className="btn btn-primary" onClick={onVincular} disabled={busy}><i className="ti ti-brand-google-drive" /> Vincular Google Drive</button>
        </div>
      )}

      {/* Toolbar: breadcrumb + busca + ações */}
      <div className="rel-card" style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14 }}>
          <span className="os-link" onClick={() => setCur(null)} style={{ fontWeight: cur ? 500 : 700 }}><i className="ti ti-home" /> Início</span>
          {path.map((f) => (
            <span key={f.id}>
              {' '}<i className="ti ti-chevron-right" style={{ fontSize: 11, color: 'var(--text-3)' }} />{' '}
              <span className="os-link" onClick={() => setCur(f.id)} style={{ fontWeight: f.id === cur ? 700 : 500 }}>{f.nome}</span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nesta pasta..."
            style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, minWidth: 180, fontFamily: 'inherit' }} />
          {isAdmin && <button className="btn btn-ghost" onClick={onNovaPasta} disabled={busy}><i className="ti ti-folder-plus" /> Nova pasta</button>}
          {isAdmin && (
            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
              <i className="ti ti-cloud-upload" /> Enviar arquivo
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={onUpload} disabled={busy} />
            </label>
          )}
        </div>
      </div>

      {/* Pastas */}
      {subs.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '6px 0 8px' }}>Pastas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 10, marginBottom: 18 }}>
            {subs.map((f) => (
              <div key={f.id} onClick={() => setCur(f.id)} style={{ border: '1px solid var(--line)', borderRadius: 11, padding: 12, background: 'var(--surface)', display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  <i className="ti ti-folder-filled" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.nome}{f.drive && <i className="ti ti-brand-google-drive" style={{ color: 'var(--green)', fontSize: 12, marginLeft: 4 }} title="Sincronizada com o Google Drive" />}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{itensDe(f.id)} item(ns)</div>
                </div>
                {isAdmin && <i className="ti ti-trash" style={{ color: 'var(--text-3)', fontSize: 15, cursor: 'pointer' }} title="Excluir pasta" onClick={(e) => { e.stopPropagation(); onExcluirPasta(f) }} />}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Arquivos */}
      {files.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '6px 0 8px' }}>Arquivos</div>
          <div className="cli-card"><div className="cli-scroll">
            <table className="cli-table">
              <thead><tr><th>Nome</th><th>Tamanho</th><th>Enviado por</th><th>Data</th><th>Ações</th></tr></thead>
              <tbody>
                {files.map((f) => {
                  const ic = discoIco(f.tipo)
                  return (
                    <tr key={f.id}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                        <i className={`ti ${ic.icon}`} style={{ color: ic.cor, fontSize: 19 }} /> {f.nome}
                        {f.drive && <i className="ti ti-brand-google-drive" style={{ color: 'var(--green)', fontSize: 12 }} title="No Google Drive" />}
                      </span></td>
                      <td>{discoFmt(f.bytes)}</td>
                      <td>{f.por}</td>
                      <td>{dataBR(f.criado_em)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="os-link" onClick={() => onBaixar(f.id)}><i className="ti ti-download" /> Baixar</span>
                        {isAdmin && <> · <span className="os-link" style={{ color: 'var(--red)' }} onClick={() => onExcluirArq(f)}><i className="ti ti-trash" /></span></>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div></div>
        </>
      )}

      {/* Empty-state */}
      {subs.length === 0 && files.length === 0 && (
        <div className="rel-card" style={{ textAlign: 'center', padding: 34 }}>
          <i className="ti ti-folder-off" style={{ fontSize: 30, color: 'var(--text-3)' }} />
          <p style={{ fontWeight: 600, margin: '10px 0 2px' }}>{busca ? 'Nada encontrado para a busca.' : 'Pasta vazia'}</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{isAdmin ? 'Crie uma pasta ou envie um arquivo.' : 'Somente administradores enviam arquivos. Você pode visualizar e baixar.'}</p>
        </div>
      )}
    </>
  )
}
