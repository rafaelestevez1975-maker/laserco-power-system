import { SacTabs } from '@/components/sac/SacTabs'

/**
 * Layout do módulo SAC — header `rel-head` + barra de abas `sac-tabs` 1:1 com o legado
 * (legacy/index.html:2539 section #view-sac; sacTabsBar 8966). Fica acima de TODAS as abas do
 * SAC (dashboard, chamados, kanban, triagem, atendentes, ranking, config, importar, pagamentos,
 * relatorios), exatamente como no legado o header e a barra de abas vinham antes do conteúdo.
 */
export default function SacLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="rel-head">
        <div className="ri" style={{ background: '#F7E7EB', color: 'var(--brand-500)' }}>
          <i className="ti ti-headset" />
        </div>
        <div>
          <h2>SAC · Central de Atendimento</h2>
          <p>Sistema de Gestão de Atendimento ao cliente da rede chamados, Kanban, triagem WhatsApp, reembolsos, premiação e relatórios.</p>
        </div>
      </div>
      <SacTabs />
      {children}
    </>
  )
}
