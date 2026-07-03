'use client'

import { useState } from 'react'
import {
  exportClientes,
  exportContas,
  exportLeads,
  exportAgendamentos,
  exportColaboradores,
  exportChamados,
  type ExportResult,
  type DatasetKey,
} from '@/app/(app)/exportacoes/actions'
import { EXPORT_LIMIT } from '@/lib/exportacoes'

type Dataset = {
  key: DatasetKey
  label: string
  icon: string
  desc: string
  /** Conta real (count head:true) calculada no servidor; null = não medido (ex.: leads externos). */
  count: number | null
  /** Não respeita unidade ativa (ex.: leads do site, fonte externa). */
  redeInteira?: boolean
  run: () => Promise<ExportResult>
}

const ACOES: Record<DatasetKey, () => Promise<ExportResult>> = {
  clientes: exportClientes,
  contas: exportContas,
  leads: exportLeads,
  agendamentos: exportAgendamentos,
  colaboradores: exportColaboradores,
  chamados: exportChamados,
}

type Counts = Partial<Record<DatasetKey, number | null>>

/** Escapa um campo para CSV (separador ';'): aspas duplicadas e wrap em aspas. */
function escCsv(v: string): string {
  return `"${(v ?? '').replace(/"/g, '""')}"`
}

/** Monta o CSV (BOM utf-8, separador ';', quebra \r\n) e baixa via Blob. */
function baixarCsv(nomeBase: string, cols: string[], rows: Record<string, string>[]) {
  const head = cols.map(escCsv).join(';')
  const linhas = rows.map((r) => cols.map((c) => escCsv(String(r[c] ?? ''))).join(';'))
  const csv = '﻿' + [head, ...linhas].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nomeBase}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function ExportacoesHub({ counts, activeUnitName, escopoUnidade }: {
  counts: Counts
  activeUnitName: string
  escopoUnidade: boolean
}) {
  const datasets: Dataset[] = [
    { key: 'clientes', label: 'Clientes', icon: 'ti-users', desc: 'Nome, contato, CPF, cidade, pontos, créditos e status.', count: counts.clientes ?? null, run: ACOES.clientes },
    { key: 'contas', label: 'Contas a pagar / receber', icon: 'ti-coins', desc: 'Lançamentos financeiros: valor, vencimento, status, categoria.', count: counts.contas ?? null, run: ACOES.contas },
    { key: 'agendamentos', label: 'Agendamentos', icon: 'ti-calendar-event', desc: 'Cliente, serviço, profissional, horário e status.', count: counts.agendamentos ?? null, run: ACOES.agendamentos },
    { key: 'colaboradores', label: 'Colaboradores', icon: 'ti-id-badge-2', desc: 'Equipe: cargo, área, regime, admissão e status.', count: counts.colaboradores ?? null, run: ACOES.colaboradores },
    { key: 'chamados', label: 'Chamados SAC', icon: 'ti-headset', desc: 'Protocolo, cliente, canal, motivo, prioridade, fase e SLA.', count: counts.chamados ?? null, run: ACOES.chamados },
    { key: 'leads', label: 'Leads do site', icon: 'ti-world-www', desc: 'Leads do lasercompany.com: nome, contato, área e origem.', count: counts.leads ?? null, redeInteira: true, run: ACOES.leads },
  ]

  const [busy, setBusy] = useState<DatasetKey | null>(null)
  const [erro, setErro] = useState<Record<string, string>>({})
  const [ok, setOk] = useState<Record<string, string>>({})

  async function exportar(d: Dataset) {
    setBusy(d.key)
    setErro((p) => ({ ...p, [d.key]: '' }))
    setOk((p) => ({ ...p, [d.key]: '' }))
    try {
      const r = await d.run()
      if (!r.ok) {
        setErro((p) => ({ ...p, [d.key]: r.error || 'Erro ao exportar.' }))
        return
      }
      if (r.rows.length === 0) {
        setErro((p) => ({ ...p, [d.key]: 'Nenhum registro para exportar neste escopo.' }))
        return
      }
      baixarCsv(d.key, r.cols, r.rows)
      setOk((p) => ({ ...p, [d.key]: `${r.rows.length.toLocaleString('pt-BR')} linha(s) exportada(s).${r.truncado ? ` Limite de ${EXPORT_LIMIT.toLocaleString('pt-BR')} atingido  refine antes de baixar tudo.` : ''}` }))
    } catch {
      setErro((p) => ({ ...p, [d.key]: 'Falha ao gerar o arquivo. Tente novamente.' }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 16 }}>
        <i className="ti ti-download" /> Central de exportações em <b>CSV</b> (separador <code>;</code>, compatível com Excel pt-BR).
        Os dados respeitam a unidade ativa: <b>{activeUnitName}</b>
        {escopoUnidade ? '.' : ' (todas as unidades  selecione uma no topo para reduzir o escopo).'}
        {' '}Limite de <b>{EXPORT_LIMIT.toLocaleString('pt-BR')}</b> linhas por arquivo.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {datasets.map((d) => {
          const carregando = busy === d.key
          const vazio = d.count === 0
          return (
            <div key={d.key} className="lc-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 10, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
                  <i className={`ti ${d.icon}`} style={{ fontSize: 21 }} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 15 }}>{d.label}</b>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {d.count != null
                      ? <>{d.count.toLocaleString('pt-BR')} registro(s){d.redeInteira ? '' : escopoUnidade ? ' nesta unidade' : ' (todas)'}</>
                      : <span style={{ color: 'var(--text-3)' }}>{d.redeInteira ? 'Fonte externa (site)' : 'Contagem indisponível'}</span>}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, minHeight: 34 }}>{d.desc}</p>

              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => exportar(d)}
                  disabled={carregando || vazio}
                  title={vazio ? 'Sem registros para exportar' : undefined}
                  style={{ justifyContent: 'center' }}
                >
                  {carregando
                    ? <><i className="ti ti-loader-2" /> Gerando…</>
                    : <><i className="ti ti-file-download" /> Exportar CSV</>}
                </button>

                {erro[d.key] && (
                  <div style={{ fontSize: 12, color: 'var(--red, #D85563)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-alert-triangle" /> {erro[d.key]}
                  </div>
                )}
                {ok[d.key] && (
                  <div style={{ fontSize: 12, color: '#15803D', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-circle-check" /> {ok[d.key]}
                  </div>
                )}
                {!erro[d.key] && !ok[d.key] && vazio && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    <i className="ti ti-database-off" /> Nenhum registro neste escopo.
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
