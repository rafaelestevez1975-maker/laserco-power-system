'use client'

// Blocos de paridade com o legado expDisparos (8593): "Listas disponíveis",
// "Histórico de disparos" e gráfico "Resultado por campanha", além de KPIs.
// As listas são derivadas da base de clientes do sistema / captação / importadas;
// o histórico persiste campanhas reais via canais_whatsapp/uazapi (passado por props).

import type { ExpLista, ExpDisparo } from './types'

function Kpi({ label, value, icon, cor }: { label: string; value: string; icon: string; cor?: string }) {
  return (
    <div className="kpi">
      <div className="kicon" style={{ background: (cor || 'var(--brand-500)') + '22', color: cor || 'var(--brand-500)' }}><i className={`ti ${icon}`} /></div>
      <div className="klabel">{label}</div>
      <div className="kvalue">{value}</div>
    </div>
  )
}

function fonteBadge(fonte: ExpLista['fonte']) {
  if (fonte === 'Sistema') return <span className="os-st os-fechada">Base do sistema</span>
  if (fonte === 'Importada') return <span className="os-st os-andamento">Importada</span>
  return <span className="os-st">Captação</span>
}

export function DisparosResumo({ listas, historico }: { listas: ExpLista[]; historico: ExpDisparo[] }) {
  const tot = historico.reduce((a, d) => a + d.env, 0)
  const resp = historico.reduce((a, d) => a + d.resp, 0)
  const ativas = historico.filter((d) => d.status !== 'Concluído').length
  const taxa = tot > 0 ? Math.round((resp / tot) * 100) : 0

  // Gráfico "Resultado por campanha" (legado barChart 8606): respostas por campanha.
  const maxResp = Math.max(1, ...historico.map((d) => d.resp))

  return (
    <div style={{ marginTop: 18, maxWidth: 980 }}>
      <div className="rel-legend">
        <b>Disparador de WhatsApp da Expansão.</b> Use <b>listas da base de clientes do sistema</b> (ex.: inativos, por unidade) ou <b>importe outras listas</b> (CSV). Cada conversa iniciada vira lead no funil de Expansão, com controle e dashboard de resultados.
      </div>

      <div className="kpi-grid">
        <Kpi label="Mensagens enviadas" value={tot.toLocaleString('pt-BR')} icon="ti-send" />
        <Kpi label="Taxa de resposta" value={`${taxa}%`} icon="ti-message-reply" cor="#0d9488" />
        <Kpi label="Campanhas ativas" value={String(ativas)} icon="ti-rocket" cor="#f59e0b" />
        <Kpi label="Listas disponíveis" value={String(listas.length)} icon="ti-list" cor="#8b5cf6" />
      </div>

      {/* Resultado por campanha */}
      {historico.length > 0 && (
        <div className="dash-w" style={{ marginBottom: 16 }}>
          <h4><i className="ti ti-chart-bar" /> Resultado por campanha</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {historico.map((d) => (
              <div key={d.nome} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 180, fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.nome}</div>
                <div style={{ flex: 1, background: 'var(--line)', borderRadius: 7, overflow: 'hidden' }}>
                  <div style={{ height: 22, width: `${Math.round((d.resp / maxResp) * 100)}%`, background: 'var(--brand-500)', borderRadius: 7, minWidth: d.resp ? 6 : 0 }} />
                </div>
                <div style={{ width: 40, textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{d.resp}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Listas disponíveis */}
      <div className="rel-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
        <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-list-details flt" /> Listas disponíveis</span></div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Lista</th><th>Fonte</th><th style={{ textAlign: 'right' }}>Contatos</th></tr></thead>
            <tbody>
              {listas.length === 0
                ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 18 }}>Nenhuma lista disponível.</td></tr>
                : listas.map((l) => (
                  <tr key={l.nome}>
                    <td>{l.nome}</td>
                    <td>{fonteBadge(l.fonte)}</td>
                    <td style={{ textAlign: 'right' }}>{l.qtd.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Histórico de disparos */}
      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-history flt" /> Histórico de disparos</span></div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Campanha</th><th>Lista</th><th style={{ textAlign: 'right' }}>Enviadas</th><th style={{ textAlign: 'right' }}>Entregues</th><th style={{ textAlign: 'right' }}>Respostas</th><th>Status</th></tr></thead>
            <tbody>
              {historico.length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 18 }}>Nenhuma campanha disparada ainda.</td></tr>
                : historico.map((d) => (
                  <tr key={d.nome}>
                    <td><b>{d.nome}</b></td>
                    <td>{d.lista}</td>
                    <td style={{ textAlign: 'right' }}>{d.env.toLocaleString('pt-BR')}</td>
                    <td style={{ textAlign: 'right' }}>{d.entr.toLocaleString('pt-BR')}</td>
                    <td style={{ textAlign: 'right' }}>{d.resp} ({d.env ? Math.round((d.resp / d.env) * 100) : 0}%)</td>
                    <td>{d.status === 'Concluído' ? <span className="os-st os-fechada">Concluído</span> : <span className="os-st os-andamento">Em andamento</span>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
