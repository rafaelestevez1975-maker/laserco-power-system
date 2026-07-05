/**
 * Sync OPERACIONAL do BEMP (Postgres direto) → staging lkii → tabelas do sistema.
 * Pedido do Julio 04/07 ("agenda/OS/financeiro dos últimos 2-3 meses, igual ao BEMP").
 *
 * O que faz (idempotente, upsert por bemp_id):
 *   1. bemp_billings: completa o buraco 12/mai–31/mai (bak ia até 11/mai; jun/jul já importados)
 *   2. bemp_agendamentos: importa os schedules de JULHO (staging tinha só junho)
 *   3. transform staging → agendamentos (mesma regra do sync original)
 *
 * Uso: NODE_PATH=<node_modules com 'pg'> node scripts/sync-bemp-operacional.mjs
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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }
const sch = bemp.BEMP_PG_SCHEMA || 'public'

const pg = new Client({ host: bemp.BEMP_PG_HOST, port: +bemp.BEMP_PG_PORT, database: bemp.BEMP_PG_DATABASE, user: bemp.BEMP_PG_USER, password: bemp.BEMP_PG_PASSWORD, ssl: bemp.BEMP_PG_SSL === 'true' ? { rejectUnauthorized: false } : false })
await pg.connect()

async function enviar(tabela, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 1000) {
    const lote = rows.slice(i, i + 1000)
    const url = `${SB}/rest/v1/${tabela}${onConflict ? `?on_conflict=${onConflict}` : ''}`
    const r = await fetch(url, { method: 'POST', headers: onConflict ? H : { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(lote) })
    if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  }
}

// ── 1) billings 12/mai–31/mai. A fonte NÃO tem id (staging usa serial); a janela está
//     comprovadamente vazia no staging  INSERT puro, com guarda de re-execução. ──
const jaTem = await (await fetch(`${SB}/rest/v1/bemp_billings?select=id&data=gte.2026-05-12&data=lt.2026-06-01&limit=1`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json()
if (jaTem.length > 0) console.log('billings 12-31/mai: janela já preenchida  pulando (idempotência)')
else {
  const { rows: bil } = await pg.query(`
    select salon_id, order_id, customer_id, user_id, service_id, product_id, package_id,
           subscription_plan_id, date, entity, payment_type, origin, quantity, price, discount,
           commission, commission_retention, payment_retention, total, total_gross, total_net, gift
      from ${sch}.billings where date >= '2026-05-12' and date < '2026-06-01'`)
  await enviar('bemp_billings', bil.map((r) => ({
    bemp_salon_id: r.salon_id, bemp_order_id: r.order_id, bemp_customer_id: r.customer_id,
    bemp_user_id: r.user_id, bemp_service_id: r.service_id, bemp_product_id: r.product_id,
    bemp_package_id: r.package_id, bemp_plan_id: r.subscription_plan_id,
    data: r.date, entity: r.entity, payment_type: r.payment_type, origem: r.origin,
    quantidade: r.quantity, preco: r.price, desconto: r.discount, comissao: r.commission,
    commission_retention: r.commission_retention, payment_retention: r.payment_retention,
    total: r.total, total_bruto: r.total_gross, total_liquido: r.total_net, presente: r.gift === true,
    sincronizado_em: new Date().toISOString(),
  })))
  console.log(`billings 12-31/mai: ${bil.length} inseridos`)
}

// ── 2) schedules de julho → bemp_agendamentos (colunas reais: start_time/end_time) ──
const { rows: ags } = await pg.query(`
  select id, salon_id, customer_id, user_id, start_time, end_time, status, origin, note, created_at
    from ${sch}.schedules where start_time >= '2026-07-01'`)
await enviar('bemp_agendamentos', ags.map((r) => ({
  bemp_id: Number(r.id), bemp_salon_id: r.salon_id, bemp_customer_id: r.customer_id, bemp_user_id: r.user_id,
  inicio: r.start_time, fim: r.end_time, status: r.status, origem: r.origin, observacao: r.note,
  criado_no_bemp_em: r.created_at, sincronizado_em: new Date().toISOString(),
})), 'bemp_id')
console.log(`schedules julho: ${ags.length} upsertados no staging`)
await pg.end()

// ── 3) transform staging → agendamentos (mesma regra do restore) ──
const MGMT = 'https://api.supabase.com/v1/projects/lkiihnxznphxqekrgsgi/database/query'
const MGMT_TOKEN = process.env.SUPABASE_MGMT_TOKEN || ''
if (MGMT_TOKEN) {
  const sql = `insert into agendamentos (empresa_id, unidade_id, inicio, fim, status, origem, observacao, bemp_id, criado_em)
select '00000000-0000-0000-0000-000000000001', u.id, b.inicio, b.fim,
  case b.status when 'Fechada' then 'concluido' when 'Cancelada' then 'cancelado' when 'Aberta' then 'aberto'
                when 'Confirmada' then 'confirmado' when 'Em atendimento' then 'em_atendimento' else 'aberto' end::status_agendamento,
  'sistema', b.observacao, b.bemp_id, coalesce(b.criado_no_bemp_em, b.inicio)
from bemp_agendamentos b join unidades u on u.bemp_salon_id = b.bemp_salon_id
where not exists (select 1 from agendamentos a where a.bemp_id = b.bemp_id)`
  const r = await fetch(MGMT, { method: 'POST', headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) })
  console.log('transform → agendamentos:', r.status)
} else console.log('transform: rode o SQL manualmente (SUPABASE_MGMT_TOKEN não definido)')
console.log('OK')
