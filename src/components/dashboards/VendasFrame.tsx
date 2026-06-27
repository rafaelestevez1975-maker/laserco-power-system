'use client'

import { useRef } from 'react'

/**
 * Moldura client do iframe de Vendas — réplica do bloco vendas do buildDashb() (legado L4600).
 * Embute /vendas-dashboards.html (hospedado em public/), aciona showPage(pg) no onLoad e
 * oferece os botões Atualizar (recarrega) e Abrir em nova aba.
 */
export function VendasFrame({ pg }: { pg: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const src = '/vendas-dashboards.html'

  function atualizar() {
    const f = ref.current
    if (f) f.src = f.src // força reload mantendo a página
  }
  function abrirNovaAba() {
    window.open(src, '_blank', 'noopener')
  }
  function aoCarregar() {
    const f = ref.current
    if (!f) return
    const go = () => {
      try {
        const w = f.contentWindow as (Window & { showPage?: (p: string) => void }) | null
        if (w?.showPage) w.showPage(pg)
      } catch {
        /* cross-origin/sandbox: ignora */
      }
    }
    go()
    setTimeout(go, 400)
    setTimeout(go, 1100)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        <button className="btn btn-ghost" type="button" onClick={atualizar}>
          <i className="ti ti-refresh" /> Atualizar
        </button>
        <button className="btn" type="button" onClick={abrirNovaAba}>
          <i className="ti ti-external-link" /> Abrir em nova aba
        </button>
      </div>
      <div style={{ height: 'calc(100vh - 250px)', minHeight: 560, border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
        <iframe
          ref={ref}
          src={src}
          title="Dashboards de Vendas — Laser&Co"
          onLoad={aoCarregar}
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </div>
    </>
  )
}
