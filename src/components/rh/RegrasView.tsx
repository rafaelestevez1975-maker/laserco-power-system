'use client'

import { useState } from 'react'
import { REGRAS_REDE, REGRAS_CATEGORIAS, REGRAS_NIVEL } from '@/lib/rh'

/**
 * RH · Regras da Rede  porta a tela "Regras Gerais da Rede" do portal RH
 * (legacy/portal-rh.html): busca + filtro por categoria + accordion das 10 regras
 * com pill de nível (Obrigatório/Importante/Recomendado) e alertas em vermelho.
 */
export function RegrasView() {
  const [aberta, setAberta] = useState<string | null>(null)
  const [cat, setCat] = useState('Todas')
  const [busca, setBusca] = useState('')

  const filtradas = REGRAS_REDE.filter((r) => {
    const okCat = cat === 'Todas' || r.categoria === cat
    const okBusca = r.titulo.toLowerCase().includes(busca.toLowerCase()) || r.categoria.toLowerCase().includes(busca.toLowerCase())
    return okCat && okBusca
  })

  return (
    <div>
      <div className="rel-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '0 0 14px', padding: '12px 16px', background: '#FFF7E6', border: '1px solid #F0D89A' }}>
        <i className="ti ti-alert-triangle" style={{ color: 'var(--amber)', fontSize: 18, flexShrink: 0, marginTop: 1 }} />
        <div>
          <b style={{ fontSize: 13, color: '#A16207' }}>Leitura obrigatória</b>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>
            Todas as normas aqui descritas fazem parte do contrato de trabalho e Código de Conduta da Laser&Co. O desconhecimento das regras não isenta de responsabilidade.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Buscar regras..."
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }}>
          {REGRAS_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtradas.map((r) => {
          const aberto = aberta === r.id
          const nivel = REGRAS_NIVEL[r.nivel]
          return (
            <div key={r.id} className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                onClick={() => setAberta(aberto ? null : r.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 14 }}>{r.titulo}</b>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: nivel.bg, color: nivel.color }}>{nivel.label}</span>
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{r.categoria}</span>
                </div>
                <i className={`ti ${aberto ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
              {aberto && (
                <div style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--line)' }}>
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
                    {r.itens.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                  {r.alerta && (
                    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#FBE9EB', border: '1px solid #F3C6CC' }}>
                      <p style={{ fontSize: 11.5, color: '#B91C1C', margin: 0, fontWeight: 600 }}>{r.alerta}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {filtradas.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
            <i className="ti ti-book-off" style={{ fontSize: 26, display: 'block', marginBottom: 8 }} />
            Nenhuma regra encontrada para os filtros selecionados.
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, padding: '12px 16px', borderRadius: 10, background: 'var(--surface-2)', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>Dúvidas sobre as regras? Fale com o RH: <b>rh@lasercompany.com</b></p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>Última atualização: junho/2026 · Versão 2.0</p>
      </div>
    </div>
  )
}
