import Link from 'next/link'
import { RegrasView } from '@/components/rh/RegrasView'

export const dynamic = 'force-dynamic'

/**
 * RH · Regras da Rede — políticas/condutas da rede (legacy/portal-rh.html, tela
 * "Regras Gerais da Rede"). Conteúdo estático (10 regras r1..r10) portado em src/lib/rh.ts.
 */
export default function RegrasPage() {
  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#1e293b', color: '#fff' }}><i className="ti ti-book" /></div>
        <div>
          <h2>Regras Gerais da Rede</h2>
          <p>Normas e condutas — Laser&Co.</p>
        </div>
        <Link href="/rh" className="btn btn-ghost" style={{ marginLeft: 'auto' }}><i className="ti ti-arrow-left" /> Dashboard RH</Link>
      </div>
      <RegrasView />
    </div>
  )
}
