/**
 * Índices econômicos REAIS via API SGS do Banco Central (pública, sem chave).
 * Substitui os valores embarcados da aba Cálculos (auditoria de mocks 02/07).
 *
 * Séries mensais (% no mês) → acumulado 12m = (∏(1+v/100) − 1)·100:
 *   IGP-M 189 · IPCA 433 · INPC 188
 * Séries anualizadas (% a.a., último valor): SELIC meta 432 · CDI 4389
 *
 * Server-only. Cache de 6h por série (revalidate)  índice não muda intradiário.
 * Falha de rede → índice ausente; a tela avisa e desativa a correção (nunca chuta).
 */
export type IndiceEco = { label: string; acum12m: number }

const SGS = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs'

async function serie(codigo: number, ultimos: number): Promise<number[] | null> {
  try {
    const r = await fetch(`${SGS}.${codigo}/dados/ultimos/${ultimos}?formato=json`, {
      next: { revalidate: 21600 },
      headers: { Accept: 'application/json' },
    })
    if (!r.ok) return null
    const d = (await r.json()) as { valor: string }[]
    const vals = d.map((x) => parseFloat(String(x.valor).replace(',', '.'))).filter((n) => Number.isFinite(n))
    return vals.length ? vals : null
  } catch { return null }
}

const acum12 = (mensais: number[]) => (mensais.reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100

/** Busca os 5 índices da aba Cálculos. Retorna só os que a API respondeu (parcial é ok). */
export async function indicesEconomicos(): Promise<Record<string, IndiceEco>> {
  const [igpm, ipca, inpc, selic, cdi] = await Promise.all([
    serie(189, 12), serie(433, 12), serie(188, 12), serie(432, 1), serie(4389, 1),
  ])
  const out: Record<string, IndiceEco> = {}
  if (igpm) out['IGP-M'] = { label: 'IGP-M', acum12m: Math.round(acum12(igpm) * 100) / 100 }
  if (ipca) out['IPCA'] = { label: 'IPCA', acum12m: Math.round(acum12(ipca) * 100) / 100 }
  if (inpc) out['INPC'] = { label: 'INPC', acum12m: Math.round(acum12(inpc) * 100) / 100 }
  if (selic) out['SELIC'] = { label: 'SELIC (a.a.)', acum12m: Math.round(selic[selic.length - 1] * 100) / 100 }
  if (cdi) out['CDI'] = { label: 'CDI (a.a.)', acum12m: Math.round(cdi[cdi.length - 1] * 100) / 100 }
  return out
}
