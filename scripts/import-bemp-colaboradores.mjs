/**
 * Importa COLABORADORES ativos do BEMP como ESQUELETO (GO do Rafael 05/07: "importa com o que
 * tem, franqueados completam depois"). O BEMP não tem CPF nem vínculo de loja na tabela users;
 * a unidade é derivada dos ATENDIMENTOS (executions: user_id → salon mais frequente).
 * Só entram os que têm unidade derivável (o resto não tem como atribuir loja, que é obrigatória).
 *
 * Placeholders (marcados p/ o franqueado completar): cpf='PEND-<bemp_id>' (único),
 * data_admissao=2026-01-01 (sentinela), regime clt, tipo loja. observacoes avisa o que falta.
 * Idempotente por cpf (PEND-<bemp_id>).
 *
 * Uso: NODE_PATH=<node_modules com pg> node scripts/import-bemp-colaboradores.mjs
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

// user ativo → salon mais frequente (executions abr→) + nome/role
const { rows } = await pg.query(`
  with sal as (
    select user_id, salon_id, count(*) n,
           row_number() over (partition by user_id order by count(*) desc) rn
    from ${sch}.executions where date >= '2026-04-01' and user_id is not null and salon_id is not null
    group by 1,2)
  select u.id bemp_id, u.name nome, u.access_role, s.salon_id
  from ${sch}.users u join sal s on s.user_id = u.id and s.rn = 1
  where u.active order by u.id`)
await pg.end()
console.log(`${rows.length} colaboradores ativos com unidade derivável`)

// mapa salon → unidade_id do lkii
const uni = await (await fetch(`${SB}/rest/v1/unidades?select=id,bemp_salon_id&bemp_salon_id=not.is.null`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'User-Agent': 'curl/8.0' } })).json()
const uniPorSalon = new Map(uni.map((u) => [Number(u.bemp_salon_id), u.id]))

// access_role → cargo (enum: gerente, subgerente, consultora_vendas, aplicadora)
const cargoDe = (role) => {
  const r = (role || '').toLowerCase()
  if (r.includes('sub')) return 'subgerente'
  if (r.includes('gerente') || r.includes('manager')) return 'gerente'
  if (r.includes('consult') || r.includes('venda')) return 'consultora_vendas'
  return 'aplicadora' // Profissional/Profissional da Saúde/técnico
}

const payload = rows.map((r) => {
  const unidadeId = uniPorSalon.get(Number(r.salon_id))
  if (!unidadeId) return null
  return {
    unidade_id: unidadeId,
    nome: (r.nome || '').trim() || `(sem nome) #${r.bemp_id}`,
    cpf: `PEND-${r.bemp_id}`,          // placeholder único; franqueado completa
    cargo: cargoDe(r.access_role),
    regime: 'clt', tipo: 'loja', status: 'ativo',
    data_admissao: '2026-01-01',       // sentinela; franqueado ajusta (CPF 'PEND-' marca pendência)
  }
}).filter(Boolean)
console.log(`${payload.length} mapeados p/ unidade do sistema; inserindo…`)

let ok = 0, fail = 0
for (let i = 0; i < payload.length; i += 500) {
  const lote = payload.slice(i, i + 500)
  const r = await fetch(`${SB}/rest/v1/colaboradores?on_conflict=cpf`, { method: 'POST', headers: H, body: JSON.stringify(lote) })
  if (r.ok) ok += lote.length
  else { fail += lote.length; console.error(`lote ${i}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`) }
}
console.log(`RESULTADO: ${ok} colaborador(es) importado(s) · ${fail} falha(s)`)
