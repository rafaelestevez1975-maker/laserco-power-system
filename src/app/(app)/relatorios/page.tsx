import Link from 'next/link'
import { REL_TABS } from '@/components/relatorios/RelTabs'

export const dynamic = 'force-dynamic'

// Relatórios do legado (REL_DEFS, legacy/index.html ~4256) ainda não migrados p/ dado real.
// TODO(legado: buildRelatorio): construir fontes reais p/ cada um destes.
const REL_TODO: { slug: string; label: string }[] = [
  { slug: 'assinaturas', label: 'Assinaturas' },
  { slug: 'atendimentos', label: 'Atendimentos' },
  { slug: 'avaliacoes', label: 'Avaliações' },
  { slug: 'contratos', label: 'Contratos' },
  { slug: 'crm', label: 'CRM' },
  { slug: 'descontos', label: 'Descontos' },
  { slug: 'estatisticas', label: 'Estatísticas' },
  { slug: 'exportacoes', label: 'Exportações' },
  { slug: 'fidelidade', label: 'Fidelidade' },
  { slug: 'metas', label: 'Metas' },
  { slug: 'pacotes', label: 'Pacotes' },
  { slug: 'pagamentos', label: 'Pagamentos' },
  { slug: 'revenda', label: 'Revenda' },
  { slug: 'whatsapp', label: 'WhatsApp' },
  { slug: 'ocorrencias', label: 'Ocorrências' },
  { slug: 'anamnese', label: 'Anamnese' },
  { slug: 'novos', label: 'Novos clientes (legado)' },
  { slug: 'todos', label: 'Todos (consolidado)' },
]

export default function RelatoriosIndexPage() {
  return (
    <div className="view active">
      <div style={{ margin: '0 0 14px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Relatórios</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
          Números reais do backend. Escolha um relatório.
        </p>
      </div>

      <div className="dash-grid" style={{ marginBottom: 22 }}>
        {REL_TABS.map((t) => (
          <Link key={t.slug} href={`/relatorios/${t.slug}`} className="dash-w" style={{ textDecoration: 'none', display: 'block' }}>
            <h4>
              <i className={`ti ${t.icon}`} /> {t.label}
            </h4>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Dados reais · filtros por período e unidade.</div>
          </Link>
        ))}
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 10, cursor: 'default' }}>
          <span>
            <i className="ti ti-hourglass" /> Em desenvolvimento
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{REL_TODO.length} relatórios</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {REL_TODO.map((r) => (
            <span key={r.slug} className="os-st" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
              {r.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
