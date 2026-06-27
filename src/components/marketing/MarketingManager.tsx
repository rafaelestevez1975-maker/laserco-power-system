'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type MktTab } from '@/lib/marketing'
import { marcarAtualizacoesLidas } from '@/app/(app)/marketing/actions'
import { MateriaisRede, type MaterialNode, type AtualizacaoRow, type NoticiaRow } from '@/components/marketing/MateriaisRede'
import { CampanhasWhatsapp, type CampanhaRow, type TemplateOpt } from '@/components/marketing/CampanhasWhatsapp'

export type { MaterialNode, AtualizacaoRow, NoticiaRow } from '@/components/marketing/MateriaisRede'
export type { CampanhaRow, TemplateOpt } from '@/components/marketing/CampanhasWhatsapp'

type CampanhasProps = {
  campanhas: CampanhaRow[]
  templates: TemplateOpt[]
  podeEscrever: boolean
  activeUnitId: string | null
  activeUnitName: string
  filtros: { status: string; seg: string; q: string }
  kpis: { totalCampanhas: number; enviados: number; entregues: number; lidos: number; responderam: number }
  semTabela: boolean
  erro: string | null
}

type Props = {
  isAdmin: boolean
  migrationPendente: boolean
  atualizacoes: AtualizacaoRow[]
  noticias: NoticiaRow[]
  materiais: MaterialNode[]
  naoLidos: number
  campanhasProps: CampanhasProps
}

type Aba = MktTab | 'campanhas'

/**
 * MARKETING — orquestra as 3 abas da central de materiais (legado buildMarketing
 * ~8372: Atualizações / Materiais / Notícias) + a aba Campanhas WhatsApp (feature
 * da rede já existente, sem equivalente no legado /marketing).
 */
export function MarketingManager(props: Props) {
  const { isAdmin, migrationPendente, atualizacoes, noticias, materiais, naoLidos, campanhasProps } = props
  const router = useRouter()
  const [tab, setTab] = useState<Aba>('atualizacoes')
  const [path, setPath] = useState<string[]>([])
  const marcou = useRef(false)

  // Ao abrir a aba Atualizações, marca todas como lidas (legado mktGo, 8354).
  useEffect(() => {
    if (tab === 'atualizacoes' && naoLidos > 0 && !marcou.current) {
      marcou.current = true
      marcarAtualizacoesLidas().then((r) => { if (r.ok) router.refresh() })
    }
  }, [tab, naoLidos, router])

  // mktIrPara (8404): navega via texto "A › B › C" para a pasta correspondente.
  function irParaMateriais(onde: string | null) {
    const parts = (onde || '').split('›').map((s) => s.trim()).filter(Boolean)
    const ids: string[] = []
    let parent: string | null = null
    for (const p of parts) {
      const node = materiais.find((n) => (n.parent_id ?? null) === parent && n.nome === p && n.kind !== 'arquivo')
      if (!node) break
      ids.push(node.id)
      parent = node.id
    }
    setPath(ids)
    setTab('materiais')
  }

  const tabs: [Aba, string, string, number?][] = [
    ['atualizacoes', 'Atualizações', 'ti-bell', naoLidos],
    ['materiais', 'Materiais', 'ti-folders'],
    ['noticias', 'Notícias', 'ti-news'],
    ['campanhas', 'Campanhas WhatsApp', 'ti-brand-whatsapp'],
  ]

  return (
    <div className="view active">
      {migrationPendente && (
        <div className="rel-legend" style={{ background: 'var(--amber-bg, #FFF7E6)', border: '1px solid var(--amber)', marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" /> Aplique a migration <b>scripts/migrations/marketing.sql</b> no lkii para ativar a Central de Materiais da rede (Atualizações, Materiais e Notícias).
        </div>
      )}

      {/* Abas */}
      <div className="rel-tabs" style={{ marginBottom: 14, display: 'flex', gap: 8, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {tabs.map(([k, label, ic, badge]) => (
          <button key={k} onClick={() => setTab(k)} className="btn" style={{
            border: 'none', borderBottom: tab === k ? '2px solid var(--brand-500)' : '2px solid transparent',
            borderRadius: 0, background: 'none', color: tab === k ? 'var(--brand-500)' : 'var(--text-2)', fontWeight: tab === k ? 700 : 500,
          }}>
            <i className={`ti ${ic}`} /> {label}
            {!!badge && badge > 0 && (
              <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10, marginLeft: 6 }}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'campanhas' ? (
        <CampanhasWhatsapp {...campanhasProps} />
      ) : (
        <MateriaisRede
          tab={tab as MktTab}
          isAdmin={isAdmin}
          atualizacoes={atualizacoes}
          noticias={noticias}
          materiais={materiais}
          onIrParaMateriais={irParaMateriais}
          path={path}
          setPath={setPath}
        />
      )}
    </div>
  )
}
