'use client'

import { useMemo, useState } from 'react'
import {
  HELP_KB,
  HELP_POPULARES,
  HELP_UPDATED,
  ajudaBuscar,
  ajudaCats,
  type HelpTopic,
} from '@/lib/ajuda'

/** Card de um tópico (3 blocos: O que é / Para que serve / Como usar). */
function AjudaCard({ e }: { e: HelpTopic }) {
  return (
    <div className="rel-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
          <i className={`ti ${e.ic}`} style={{ fontSize: 19 }} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{e.t}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{e.cat}</div>
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: 'var(--brand-500)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>O que é</span>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>{e.oque}</p>
      </div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: 'var(--brand-500)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Para que serve</span>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>{e.serve}</p>
      </div>
      <div>
        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: 'var(--brand-500)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Como usar / utilidade</span>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>{e.uso}</p>
      </div>
    </div>
  )
}

export function AjudaManager() {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState('')
  // Tópico aberto via chip/grade/select (id)  independente da busca por texto.
  const [picked, setPicked] = useState<string | null>(null)

  const cats = useMemo(() => ajudaCats(), [])
  const popularChips = useMemo(
    () => HELP_POPULARES.map((id) => HELP_KB.find((x) => x.id === id)).filter(Boolean) as HelpTopic[],
    [],
  )

  const query = q.trim()
  const resultados = useMemo(() => (query ? ajudaBuscar(query) : []), [query])
  const topicoSel = picked ? HELP_KB.find((x) => x.id === picked) ?? null : null

  function pick(id: string) {
    setQ('')
    setSel(id)
    setPicked(id || null)
  }

  function onBuscar(v: string) {
    setQ(v)
    setSel('')
    setPicked(null)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', background: '#fff' }

  return (
    <div className="view active">
      {/* Barra de busca + select por categoria */}
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
              Sobre qual assunto você precisa de ajuda?
            </label>
            <div style={{ position: 'relative' }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input
                value={q}
                onChange={(e) => onBuscar(e.target.value)}
                placeholder="Digite um assunto (ex.: nota fiscal, royalties, ponto, comissão)..."
                style={{ ...inp, paddingLeft: 34 }}
              />
            </div>
          </div>
          <div style={{ minWidth: 240 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
              Ou escolha um item já definido
            </label>
            <select value={sel} onChange={(e) => pick(e.target.value)} style={inp}>
              <option value=""> Selecione um tópico de ajuda </option>
              {Object.keys(cats).map((c) => (
                <optgroup key={c} label={c}>
                  {cats[c].map((e) => (
                    <option key={e.id} value={e.id}>{e.t}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>
          <i className="ti ti-refresh" /> Base de conhecimento do sistema · atualizada em {HELP_UPDATED} · {HELP_KB.length} tópicos. Esta base é revisada sempre que o sistema é alterado.
        </div>
      </div>

      {/* Resultado: busca > tópico selecionado > home */}
      <div>
        {query ? (
          resultados.length === 0 ? (
            <div className="rel-card" style={{ textAlign: 'center', padding: 24 }}>
              <i className="ti ti-mood-empty" style={{ fontSize: 30, color: 'var(--text-3)' }} />
              <p style={{ margin: '8px 0 0', fontWeight: 600 }}>Não encontramos um tópico para &quot;{query}&quot;.</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Tente outras palavras (ex.: <i>agenda</i>, <i>nota fiscal</i>, <i>royalties</i>, <i>ponto</i>, <i>comissão</i>) ou abra um <b>Chamado</b> para o suporte.
              </p>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                {resultados.length} resultado(s) para <b>&quot;{query}&quot;</b>
              </div>
              {resultados.map((e) => <AjudaCard key={e.id} e={e} />)}
            </>
          )
        ) : topicoSel ? (
          <AjudaCard e={topicoSel} />
        ) : (
          <>
            <div className="rel-card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                <i className="ti ti-bulb" style={{ color: 'var(--amber)' }} /> Tópicos mais procurados
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {popularChips.map((e) => (
                  <button key={e.id} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => pick(e.id)}>
                    <i className={`ti ${e.ic}`} /> {e.t}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Ou navegue por todos os tópicos do sistema:</div>
            </div>
            {Object.keys(cats).map((c) => (
              <div key={c}>
                <div style={{ margin: '10px 0 6px', fontWeight: 700, fontSize: 13, color: 'var(--brand-500)' }}>{c}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
                  {cats[c].map((e) => (
                    <button
                      key={e.id}
                      onClick={() => pick(e.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 13, textAlign: 'left', color: 'var(--text-2)' }}
                    >
                      <i className={`ti ${e.ic}`} style={{ color: 'var(--brand-500)' }} />
                      <span>{e.t}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
