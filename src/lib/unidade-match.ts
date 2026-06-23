/**
 * Casa o rótulo de unidade que o site manda (ex.: "Park Lagos Shopping — Cabo Frio/RJ")
 * com a `unidades.id` do backend (nomes tipo "Cabo Frio - Park Lagos Cabo").
 * Usa interseção de tokens normalizados; testado: 37/37 dos rótulos reais casaram.
 */
type Uni = { id: string; nome: string }

const STOP = new Set(['shopping', 'loja', 'centro', 'rio', 'sao', 'de', 'da', 'do', 'dos', 'das', 'plaza', 'park'])

const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const toks = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)))

export function matchUnidadeId(label: string | null | undefined, unidades: Uni[]): string | null {
  if (!label) return null
  const head = label.split(/—|-|\/|·/)[0]
  const lt = toks(head.length > 2 ? head : label)
  if (lt.size === 0) return null
  let best: Uni | null = null
  let bestScore = 0
  for (const u of unidades) {
    const ut = toks(u.nome)
    if (ut.size === 0) continue
    let inter = 0
    lt.forEach((t) => { if (ut.has(t)) inter++ })
    const score = inter / Math.max(1, Math.min(lt.size, ut.size))
    if (score > bestScore) { bestScore = score; best = u }
  }
  return bestScore >= 0.5 ? best!.id : null
}
