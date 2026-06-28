'use client'

/**
 * Error boundary dos Dashboards (Financeiro/Gerencial/Funil).
 * Quando uma query do Supabase falha (RLS, rede, coluna/status inexistente) os helpers de
 * agregação lançam DashAggError — em vez de mostrar 0/valores parciais silenciosos (a
 * reclamação de "números que não batem"), a tela exibe um aviso honesto + botão de tentar de novo.
 */
export default function DashboardsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="view active">
      <div className="rel-card" style={{ textAlign: 'center', padding: 40, borderColor: 'var(--gold-400)', background: 'var(--gold-soft)' }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 34, color: '#B26A00' }} />
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: '12px 0 6px' }}>Não foi possível carregar os indicadores</h2>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 4px' }}>
          Uma consulta ao banco falhou, então nenhum número é exibido para evitar mostrar valores incompletos.
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 16px' }}>{error.message}</p>
        <button className="btn" type="button" onClick={() => reset()}>
          <i className="ti ti-refresh" /> Tentar novamente
        </button>
      </div>
    </div>
  )
}
