/**
 * Importa ORDENS DE SERVIÇO do BEMP (orders) → staging bemp_orders → tabela os.
 * Pedido do Julio 05/07 ("pega as OS do BEMP dos últimos 2-3 meses"). A tabela os estava
 * VAZIA (dashboard/vendido e /os apareciam zerados). Janela: a partir de 2026-04-01.
 * Idempotente: upsert por bemp_id no staging; transform com on conflict do nothing em os.
 *
 * Uso: SUPABASE_MGMT_TOKEN=<sbp_...> NODE_PATH=<node_modules com 'pg'> node scripts/import-bemp-os.mjs
 */
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire((process.env.NODE_PATH || process.cwd() + '/node_modules') + '/x.js')
const { Client } = require('pg')

const lerEnv = (p) => Object.fromEntries(readFileSync(p, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const env = lerEnv(new URL('../.env.local', import.meta.url).pathname)
const bemp = lerEnv('/home/jvneto/ProjetosLMK/Laser/RH/.env.local')
const SB = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.0', Prefer: 'resolution=merge-duplicates,return=minimal' }
const sch = bemp.BEMP_PG_SCHEMA || 'public'

const pg = new Client({ host: bemp.BEMP_PG_HOST, port: +bemp.BEMP_PG_PORT, database: bemp.BEMP_PG_DATABASE, user: bemp.BEMP_PG_USER, password: bemp.BEMP_PG_PASSWORD, ssl: bemp.BEMP_PG_SSL === 'true' ? { rejectUnauthorized: false } : false })
await pg.connect()

const { rows } = await pg.query(`
  select id, salon_id, customer_id, status, origin, price_total, discount_total, total_gross,
         paid_with_money_credit, total, closed_at, created_at, canceled_at, note
    from ${sch}.orders where created_at >= '2026-04-01' order by id`)
await pg.end()
console.log(`BEMP orders (abr→): ${rows.length}`)

const payload = rows.map((r) => ({
  bemp_id: Number(r.id), bemp_salon_id: r.salon_id, bemp_customer_id: r.customer_id,
  status: r.status, origin: r.origin, price_total: r.price_total, discount_total: r.discount_total,
  total_gross: r.total_gross, paid_credit: r.paid_with_money_credit, total: r.total,
  closed_at: r.closed_at, created_at: r.created_at, canceled_at: r.canceled_at, note: r.note,
  sincronizado_em: new Date().toISOString(),
}))
for (let i = 0; i < payload.length; i += 1000) {
  const lote = payload.slice(i, i + 1000)
  const r = await fetch(`${SB}/rest/v1/bemp_orders?on_conflict=bemp_id`, { method: 'POST', headers: H, body: JSON.stringify(lote) })
  if (!r.ok) throw new Error(`staging: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  if ((i + 1000) % 20000 < 1000) console.log(`  staging ${i + lote.length}…`)
}
console.log('staging bemp_orders preenchido')

// transform staging → os (join unidades por salon; cliente por bemp_id; empresa da unidade)
const MGMT = 'https://api.supabase.com/v1/projects/lkiihnxznphxqekrgsgi/database/query'
const MGMT_TOKEN = process.env.SUPABASE_MGMT_TOKEN
if (!MGMT_TOKEN) { console.log('defina SUPABASE_MGMT_TOKEN p/ o transform'); process.exit(0) }
const sql = `insert into os (empresa_id, unidade_id, cliente_id, status, origem, preco_total, desconto_total, total_bruto, total_pago_credito, total, valor_pago, observacao, bemp_id, criado_em, fechada_em, cancelada_em)
select u.empresa_id, u.id, c.id,
  case b.status when 'Fechada' then 'fechada' when 'Cancelada' then 'cancelada' else 'aberta' end::status_os,
  case b.origin when 'Agendamento' then 'agendamento' when 'Pacote' then 'pacote' when 'Assinatura' then 'assinatura' else 'avulsa' end::origem_os,
  coalesce(b.price_total,0), coalesce(b.discount_total,0), coalesce(b.total_gross,0), coalesce(b.paid_credit,0), coalesce(b.total,0),
  case when b.status='Fechada' then coalesce(b.total,0) else 0 end,
  b.note, b.bemp_id, coalesce(b.created_at, now()), b.closed_at, b.canceled_at
from bemp_orders b
join unidades u on u.bemp_salon_id = b.bemp_salon_id
left join clientes c on c.bemp_id = b.bemp_customer_id
where not exists (select 1 from os o where o.bemp_id = b.bemp_id)`
const r = await fetch(MGMT, { method: 'POST', headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.0' }, body: JSON.stringify({ query: sql }) })
console.log('transform → os:', r.status, (await r.text()).slice(0, 120))
