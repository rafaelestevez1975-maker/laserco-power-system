'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

/**
 * Seletor de limite do ranking (Top 10/50/100/250/500) — réplica do rankLimitSel() do legado
 * (legacy/index.html ~6971). Persiste o limite na querystring (?limit=) e re-renderiza a página.
 */
export function RankLimitSel({ value }: { value: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function aplicar(v: string) {
    const sp = new URLSearchParams(params.toString())
    sp.set('limit', v)
    router.push(`${pathname}?${sp.toString()}`)
  }

  return (
    <div className="rf">
      <label>Exibir (limite do ranking)</label>
      <select className="mf" value={String(value)} onChange={(e) => aplicar(e.target.value)}>
        <option value="10">Top 10</option>
        <option value="50">Top 50</option>
        <option value="100">Top 100</option>
        <option value="250">Top 250</option>
        <option value="500">Top 500</option>
      </select>
    </div>
  )
}
