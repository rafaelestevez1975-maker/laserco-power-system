'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { criarTrilha, excluirTrilha } from '@/app/(app)/universidade/actions'
import type { Trilha } from './tipos'

/**
 * Admin — LISTA de trilhas (rota /universidade/gerenciar). "Nova trilha" cria e navega
 * para o EDITOR (/universidade/gerenciar/[id]) — o editor é OUTRA rota que carrega a trilha
 * do servidor, então NÃO há mais o crash de renderizar um editor com a trilha ainda ausente.
 */
export function GerenciarLista({ trilhas, podeGerir }: { trilhas: Trilha[]; podeGerir: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000) }

  if (!podeGerir) {
    return (
      <div className="rel-legend"><i className="ti ti-shield-lock" /> A gestão de trilhas, vídeos e provas é restrita a <b>administradores</b> e ao <b>Admin Universidade</b>.</div>
    )
  }

  async function novaTrilha() {
    setBusy(true)
    const r = await criarTrilha({ nome: 'Nova trilha', role: 'Novo cargo', prazo: '30 dias' })
    setBusy(false)
    if (!r.ok || !r.id) { flash(r.error || 'Erro ao criar a trilha.'); return }
    router.push(`/universidade/gerenciar/${r.id}`)
  }

  async function excluir(id: string, nome: string) {
    if (!window.confirm(`Excluir a trilha "${nome}"? Isso remove etapas, provas e progresso.`)) return
    setBusy(true)
    const r = await excluirTrilha(id)
    setBusy(false)
    if (!r.ok) { flash(r.error || 'Erro ao excluir.'); return }
    router.refresh()
  }

  return (
    <>
      <div className="rel-legend">Crie e edite as <b>trilhas por cargo</b>, <b>envie os vídeos pelo Bunny</b>, monte as <b>provas</b> (várias perguntas) e defina o <b>prazo</b>. As mudanças refletem na hora na aba Trilhas.</div>
      {msg && <div className="rel-legend" style={{ margin: '10px 0' }}><i className="ti ti-info-circle" /> {msg}</div>}
      <div className="rel-acts" style={{ justifyContent: 'flex-end', margin: '10px 0 14px' }}>
        <button className="btn btn-primary" onClick={novaTrilha} disabled={busy}><i className="ti ti-plus" /> {busy ? 'Criando…' : 'Nova trilha'}</button>
      </div>
      {trilhas.length === 0 ? (
        <div className="rel-card" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 34 }}>
          <i className="ti ti-school" style={{ fontSize: 28 }} /><p style={{ marginTop: 8 }}>Nenhuma trilha ainda. Clique em <b>Nova trilha</b> para começar.</p>
        </div>
      ) : (
        <div className="cli-card"><div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Trilha</th><th>Cargo</th><th className="num-r">Etapas</th><th>Prazo</th><th>Ações</th></tr></thead>
            <tbody>
              {trilhas.map((tr) => (
                <tr key={tr.id}>
                  <td><span className="cli-name">{tr.nome}</span></td>
                  <td>{tr.role}</td>
                  <td className="num-r">{tr.etapas.length}</td>
                  <td>{tr.prazo}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link className="os-link" href={`/universidade/gerenciar/${tr.id}`}><i className="ti ti-edit" /> Editar vídeos/provas</Link>
                    {' · '}
                    <span className="os-link" style={{ color: 'var(--red)' }} onClick={() => excluir(tr.id, tr.nome)}><i className="ti ti-trash" /></span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </>
  )
}
