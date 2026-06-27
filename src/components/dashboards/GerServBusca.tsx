'use client'

import { useState } from 'react'
import { moedaBR } from '@/lib/fmt'

export type ServItem = { nome: string; faturamento: number; sessoes: number }

/**
 * Busca de serviço (mesmo fora do Top 10) — réplica do gerServBusca() do legado
 * (legacy/index.html ~4594). Filtra a lista COMPLETA de serviços e mostra, para cada
 * resultado, a posição no ranking de faturamento, % do total, faturamento e sessões.
 */
export function GerServBusca({ servicos }: { servicos: ServItem[] }) {
  const [q, setQ] = useState('')
  const total = servicos.reduce((a, s) => a + s.faturamento, 0) || 1
  const ranked = [...servicos].sort((a, b) => b.faturamento - a.faturamento)
  const termo = q.trim().toLowerCase()
  const matches = termo ? ranked.filter((s) => s.nome.toLowerCase().includes(termo)).slice(0, 10) : []

  return (
    <div className="rel-card" style={{ marginBottom: 14 }}>
      <div className="rel-card-h" style={{ cursor: 'default' }}>
        <span><i className="ti ti-search flt" /> Buscar serviço (mesmo fora do Top 10)</span>
      </div>
      <div style={{ marginTop: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Digite o nome do serviço…"
          style={{ width: '100%', maxWidth: 440, padding: 9, border: '1px solid var(--line-strong, var(--line))', borderRadius: 9, fontFamily: 'inherit' }}
        />
        <div style={{ marginTop: 10 }}>
          {termo && matches.length === 0 && (
            <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 6 }}>Nenhum serviço encontrado para “{q}”.</div>
          )}
          {matches.map((s) => {
            const pos = ranked.indexOf(s) + 1
            const pct = Math.round((s.faturamento / total) * 1000) / 10
            return (
              <div key={s.nome} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px', marginBottom: 7 }}>
                <div>
                  <b>{s.nome}</b>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{pos}º no ranking de faturamento · {s.sessoes} sessões</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800 }}>{moedaBR(s.faturamento)}</div>
                  <div style={{ fontSize: 12, color: 'var(--brand-500)', fontWeight: 700 }}>{pct}% do total</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
