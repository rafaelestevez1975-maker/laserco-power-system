'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { carregarNotificacoes, type Notificacao } from '@/app/(app)/notificacoes/actions'

const ICONE: Record<Notificacao['tipo'], [string, string]> = {
  chamado_atraso: ['ti-clock-exclamation', 'var(--red)'],
  chamado_novo: ['ti-ticket', 'var(--brand-500)'],
  comunicado: ['ti-speakerphone', 'var(--amber)'],
}

export function NotificacoesSino() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [itens, setItens] = useState<Notificacao[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let vivo = true
    const carregar = () => carregarNotificacoes().then((r) => { if (vivo) { setItens(r.itens); setTotal(r.total) } })
    carregar()
    const t = setInterval(carregar, 60000) // atualiza a cada 1 min
    return () => { vivo = false; clearInterval(t) }
  }, [])

  function ir(href: string) { setOpen(false); router.push(href) }

  return (
    <div className="top-pop" style={{ position: 'relative' }}>
      <button className="icon-btn" title="Notificações" onClick={() => setOpen((v) => !v)}>
        <i className="ti ti-bell" />
        {total > 0 && (
          <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px', background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="role-dd" style={{ display: 'block', right: 0, top: 'calc(100% + 6px)', zIndex: 50, width: 340, maxHeight: 420, overflowY: 'auto', padding: 0 }}>
            <div className="dd-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Notificações</span><span style={{ color: 'var(--text-3)' }}>{total}</span>
            </div>
            {itens.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--text-3)' }}>Sem pendências. 🎉</div>}
            {itens.map((n, i) => {
              const [ic, cor] = ICONE[n.tipo]
              return (
                <div key={i} className="role-opt" style={{ alignItems: 'flex-start', gap: 10, whiteSpace: 'normal' }} onClick={() => ir(n.href)}>
                  <i className={`ti ${ic}`} style={{ color: cor, marginTop: 2 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{n.titulo}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.detalhe}</div>
                    {n.quando && <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{new Date(n.quando).toLocaleString('pt-BR')}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
