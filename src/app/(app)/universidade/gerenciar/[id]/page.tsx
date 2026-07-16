import Link from 'next/link'
import { carregarTrilhaEdicao, podeGerirUniversidade } from '../../data'
import { UniNav } from '@/components/universidade/UniNav'
import { TrilhaEditor } from '@/components/universidade/TrilhaEditor'

export const dynamic = 'force-dynamic'

/** /universidade/gerenciar/[id] — admin: EDITOR de UMA trilha (carrega do servidor por id). */
export default async function UniversidadeEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const podeGerir = await podeGerirUniversidade()

  if (!podeGerir) {
    return (
      <div className="view active">
        <UniNav podeGerir={false} />
        <div className="rel-legend"><i className="ti ti-shield-lock" /> A gestão de trilhas, vídeos e provas é restrita a <b>administradores</b> e ao <b>Admin Universidade</b>.</div>
      </div>
    )
  }

  const trilha = await carregarTrilhaEdicao(id)

  return (
    <div className="view active">
      <UniNav podeGerir={podeGerir} />
      {trilha ? (
        <TrilhaEditor trilha={trilha} />
      ) : (
        <div className="rel-card" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 34 }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 26 }} />
          <p style={{ marginTop: 8 }}>Trilha não encontrada.</p>
          <Link className="os-link" href="/universidade/gerenciar"><i className="ti ti-arrow-left" /> Voltar às trilhas</Link>
        </div>
      )}
    </div>
  )
}
