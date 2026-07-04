/**
 * Importa/atualiza a BASE DE CLIENTES do BEMP (Postgres direto) para clientes do lkii.
 * GO do cliente em 04/07/2026 ("Pode fazer a importação").
 *
 * Estratégia: UPSERT completo por bemp_id (índice único clientes_bemp_id_key)  atualiza
 * cadastro dos existentes (o sync antigo NÃO trazia CPF/RG; este traz) e insere os novos.
 * Idempotente: rodar de novo só re-upserta. Campos fora do payload (empresa_id, saldos)
 * são preservados nos existentes.
 *
 * Uso:  NODE_PATH=<dir com node_modules de 'pg'> node scripts/import-bemp-clientes.mjs
 * Env:  .env.local do repo (SUPABASE) + ../RH/.env.local (BEMP_PG_*).
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

// coerção defensiva: o driver devolve number p/ colunas numéricas (ex.: street_number)
const digitos = (s) => String(s ?? '').replace(/\D/g, '') || null
const limpo = (s) => { const t = String(s ?? '').trim(); return t || null }
const dataISO = (d) => { if (!d) return null; const t = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null }

function mapear(r) {
  const tel = [r.phone_country_code, r.phone_area_code, r.phone_number].map((x) => digitos(x) || '').join('')
  return {
    bemp_id: Number(r.id),
    nome: limpo(r.name) || `(sem nome) #${r.id}`,
    email: limpo(r.email),
    telefone: tel || null,
    // CPF normalizado só dígitos (o SAC/atendimento busca por CPF); RG idem campo próprio.
    cpf: r.document_type === 'cpf' ? digitos(r.document_id) : null,
    rg: r.document_type === 'rg' ? limpo(r.document_id) : null,
    data_nascimento: dataISO(r.birthdate),
    genero: limpo(r.gender),
    canal_origem: limpo(r.channel),
    cep: limpo(r.zipcode),
    rua: limpo(r.street),
    numero: limpo(r.street_number),
    complemento: limpo(r.street_complement),
    bairro: limpo(r.neighborhood),
    cidade: limpo(r.city),
    estado: limpo(r.state),
    ativo: r.active !== false,
    verificado: r.verified === true,
    importado_do_bemp: true,
    criado_em: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  }
}

const LOTE = 1000
let ultimo = 0, total = 0, falhas = 0
const t0 = Date.now()
for (;;) {
  const { rows } = await pg.query(
    `select id, name, active, email, birthdate, verified, gender, channel,
            phone_country_code, phone_area_code, phone_number,
            document_type, document_id, zipcode, street, street_number,
            street_complement, neighborhood, city, state, created_at
       from ${sch}.customers where id::bigint > $1 order by id::bigint limit ${LOTE}`, [ultimo])
  if (rows.length === 0) break
  ultimo = Number(rows[rows.length - 1].id)
  const payload = rows.map(mapear)
  let r = await fetch(`${SB}/rest/v1/clientes?on_conflict=bemp_id`, { method: 'POST', headers: H, body: JSON.stringify(payload) })
  if (!r.ok) { // 1 retry (rede/timeout)
    await new Promise((ok) => setTimeout(ok, 1500))
    r = await fetch(`${SB}/rest/v1/clientes?on_conflict=bemp_id`, { method: 'POST', headers: H, body: JSON.stringify(payload) })
  }
  if (r.ok) total += rows.length
  else { falhas += rows.length; console.error(`lote até ${ultimo}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`) }
  if (total % 20000 < LOTE) console.log(`${total} upsertados… (${Math.round((Date.now() - t0) / 1000)}s)`)
}
await pg.end()
console.log(`\nRESULTADO: ${total} cliente(s) upsertado(s) · ${falhas} em lote(s) com falha · ${Math.round((Date.now() - t0) / 1000)}s`)
process.exit(falhas > 0 ? 1 : 0)
