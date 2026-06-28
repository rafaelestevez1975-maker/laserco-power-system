/**
 * Layout do módulo SAC — header `rel-head` 1:1 com o legado (legacy/index.html:2539,
 * section #view-sac). Fica acima de TODAS as abas do SAC (dashboard, chamados, kanban,
 * triagem, atendentes, ranking, config, importar, pagamentos, relatorios), exatamente como
 * no legado o header da seção vinha antes do #sacWrap.
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
      {children}
    </>
  )
}
