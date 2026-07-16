/**
 * ROBÔ de resgate dos DOCUMENTOS/ARQUIVOS dos clientes no BEMP (fotos de tratamento,
 * anamneses/fichas, anexos). Autorizado pelo cliente em 04/07/2026.
 *
 * DESTINO (regra do cliente): o ARQUIVO vai pro BUNNY (Bunny Storage, bucket clientes-docs)
 * e no SUPABASE entra só o VÍNCULO (linha em clientes_documentos com o caminho no Bunny +
 * metadados). NENHUM arquivo é salvo no Supabase.
 *
 * COMO OS DOCS FICAM NO BEMP (mapeado em 16/07 com login mateus@lasercompany.com):
 *   - App web Rails/Devise em https://laserco.bemp.app (login: POST /users/sign_in com
 *     user[organization][subdomain]=laserco, user[username], user[password], authenticity_token).
 *   - Detalhe do cliente: /customers/<id>/edit  (abas #events, #customer_contracts, ...).
 *   - As FOTOS/anexos das anamneses vêm no fragmento AJAX  /customers/<id>/events  como blobs
 *     ActiveStorage:  /storage/blobs/redirect/<token>/<nome>  (o redirect resolve numa URL S3
 *     assinada de 300s — basta seguir o redirect autenticado p/ baixar os bytes).
 *   - Contratos: /customers/<id>/contracts lista /customer_contracts/<id>/edit (assinados).
 *
 * EXECUÇÃO:  node scripts/baixar-docs-bemp.mjs [maxClientes]
 *   Idempotente (pula arquivo já registrado por arquivo_path), tolerante a falha (loga e segue),
 *   ritmo gentil (pausa entre clientes) e re-login automático se a sessão expirar.
 */
import { readFileSync } from 'fs'
import { createHash } from 'crypto'

const lerEnv = (p) => Object.fromEntries(readFileSync(p, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const env = lerEnv(new URL('../.env.local', import.meta.url).pathname)

const BEMP_WEB_BASE = env.BEMP_WEB_BASE || 'https://laserco.bemp.app'
const { BEMP_WEB_EMAIL, BEMP_WEB_SENHA } = env
if (!BEMP_WEB_EMAIL || !BEMP_WEB_SENHA) {
  console.error('Defina BEMP_WEB_EMAIL e BEMP_WEB_SENHA no .env.local.'); process.exit(2)
}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) LaserCoMigracao/1.0'

// blindagem: uma rejeição solta não pode derrubar o robô no meio do lote.
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.message || e))
process.on('uncaughtException', (e) => console.error('uncaughtException:', e?.message || e))

const SB = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
const MAX = Number(process.argv[2]) || Infinity

// Destino dos arquivos: Bunny Storage (NÃO Supabase Storage).
const BUNNY_HOST = env.BUNNY_STORAGE_HOST || 'br.storage.bunnycdn.com'
const BUNNY_ZONE = env.BUNNY_STORAGE_ZONE
const BUNNY_KEY = env.BUNNY_STORAGE_KEY
const BUNNY_BUCKET = 'clientes-docs'
async function subirBunny(path, bytes, mime) {
  const r = await fetch(`https://${BUNNY_HOST}/${BUNNY_ZONE}/${BUNNY_BUCKET}/${path}`, {
    method: 'PUT', headers: { AccessKey: BUNNY_KEY, 'Content-Type': mime || 'application/octet-stream' }, body: Buffer.from(bytes),
  })
  return r.ok
}

// ─────────────────────────── BEMP: login + sessão (cookie jar) ───────────────────────────
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', heic: 'image/heic' }

let sessao = null
async function loginBemp() {
  const jar = {}
  const guarda = (res) => { for (const c of (res.headers.getSetCookie?.() || [])) { const nv = c.split(';')[0]; const i = nv.indexOf('='); if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1) } }
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

  const r1 = await fetch(`${BEMP_WEB_BASE}/users/sign_in`, { headers: { 'User-Agent': UA } })
  guarda(r1)
  const csrf = (await r1.text()).match(/name="authenticity_token"\s+value="([^"]+)"/)?.[1]
  if (!csrf) throw new Error('CSRF não encontrado na página de login')

  const body = new URLSearchParams({
    authenticity_token: csrf, 'user[organization][subdomain]': 'laserco',
    'user[username]': BEMP_WEB_EMAIL, 'user[password]': BEMP_WEB_SENHA,
  })
  const r2 = await fetch(`${BEMP_WEB_BASE}/users/sign_in`, {
    method: 'POST', redirect: 'manual',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: body.toString(),
  })
  guarda(r2)
  const loc = r2.headers.get('location') || ''
  if (r2.status >= 400 || /sign_in/.test(loc)) throw new Error(`Login BEMP falhou (status ${r2.status}, loc ${loc}) — checar credencial/tarefa obrigatória.`)
  return { headers: { 'User-Agent': UA, Cookie: cookie(), 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html, */*' } }
}

// GET autenticado com re-login automático se a sessão expirou (BEMP redireciona p/ /users/sign_in).
async function authFetch(url) {
  let res = await fetch(url, { headers: sessao.headers })
  if (/\/users\/sign_in/.test(res.url) || res.status === 401) {
    sessao = await loginBemp()
    res = await fetch(url, { headers: sessao.headers })
  }
  return res
}

/** Documentos de um cliente: fotos/anexos (ActiveStorage) das anamneses/eventos. */
async function fetchDocsDoCliente(_sessao, customerId) {
  const docs = []
  const vistos = new Set()
  for (const [ep, tipo] of [['events', 'foto'], ['contracts', 'contrato']]) {
    let html = ''
    try { html = await (await authFetch(`${BEMP_WEB_BASE}/customers/${customerId}/${ep}`)).text() } catch { continue }
    for (const m of html.matchAll(/\/storage\/blobs\/redirect\/[^"'\s?)>]+/g)) {
      const path = m[0]
      const token = path.split('/redirect/')[1].split('/')[0]
      const filename = (path.split('/').pop() || 'arquivo').split('?')[0]
      const hash = createHash('sha1').update(token).digest('hex').slice(0, 16)
      if (vistos.has(hash)) continue
      vistos.add(hash)
      const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] || 'bin').toLowerCase()
      docs.push({ tipo, titulo: filename, url: BEMP_WEB_BASE + path, mime: MIME[ext] || 'application/octet-stream', nome: `${hash}-${filename}` })
    }
  }
  return docs
}

// ─────────────────────────────── execução (pool paralelo) ───────────────────────────────
const csv = readFileSync(new URL('../docs/clientes-pacote-andamento-90d.csv', import.meta.url).pathname, 'utf8')
const clientes = csv.split('\n').slice(1).filter(Boolean).map((l) => ({ id: l.split(',')[0].trim(), nome: l.split(',').slice(1).join(',').trim() })).filter((c) => /^\d+$/.test(c.id))

const N_CLIENTES = Number(env.ROBO_CLIENTES_CONC || 5)  // clientes em paralelo (cada um = só 2 GETs no BEMP)
const N_ARQUIVOS = Number(env.ROBO_ARQUIVOS_CONC || 6)  // arquivos em paralelo por cliente (download S3 → Bunny)
const fila = clientes.slice(0, MAX)
console.log(`${clientes.length} clientes na fila. Processando ${fila.length} com paralelismo ${N_CLIENTES}×${N_ARQUIVOS}.`)

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
sessao = await loginBemp()
console.log('login BEMP ok.')

// pool de concorrência simples
async function mapPool(items, conc, fn) {
  let idx = 0
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; try { await fn(items[i]) } catch { /* contabilizado dentro */ } }
  }))
}

let baixados = 0, pulados = 0, falhas = 0, clientesComDoc = 0, feitos = 0
async function processarCliente(cli) {
  let docs = []
  try { docs = await fetchDocsDoCliente(sessao, cli.id) } catch { falhas++; return }
  if (docs.length) clientesComDoc++
  // idempotência em lote: paths já registrados deste cliente
  let jaSet = new Set()
  try { const arr = await (await fetch(`${SB}/rest/v1/clientes_documentos?select=arquivo_path&bemp_customer_id=eq.${cli.id}`, { headers: H })).json(); if (Array.isArray(arr)) jaSet = new Set(arr.map((r) => r.arquivo_path)) } catch {}
  const pend = docs.filter((d) => !jaSet.has(`bemp/${cli.id}/${d.tipo}/${d.nome}`))
  pulados += docs.length - pend.length
  await mapPool(pend, N_ARQUIVOS, async (d) => {
    const path = `bemp/${cli.id}/${d.tipo}/${d.nome}`
    let bin = null
    for (let t = 0; t < 2 && !bin; t++) { try { const r = await authFetch(d.url); if (r.ok) { const ab = await r.arrayBuffer(); if (ab && ab.byteLength) bin = ab } } catch {} }
    if (!bin) { falhas++; return }
    if (!(await subirBunny(path, bin, d.mime))) { falhas++; return }
    const ins = await fetch(`${SB}/rest/v1/clientes_documentos`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        bemp_customer_id: Number(cli.id), tipo: d.tipo, titulo: d.titulo || d.nome,
        arquivo_path: path, mime: d.mime || null, tamanho_bytes: bin.byteLength,
        origem: 'bemp', baixado_em: new Date().toISOString(),
      }),
    })
    if (!ins.ok) { falhas++; return }
    baixados++
  })
}

let qi = 0
await Promise.all(Array.from({ length: N_CLIENTES }, async () => {
  while (qi < fila.length) {
    const cli = fila[qi++]
    try { await processarCliente(cli) } catch (e) { falhas++; console.error(`cliente ${cli.id}: ${e?.message || e}`) }
    feitos++
    if (feitos % 25 === 0) console.log(`[${feitos}/${fila.length}] baixados=${baixados} pulados=${pulados} falhas=${falhas} c/doc=${clientesComDoc}`)
  }
}))
console.log(`\nFIM: ${baixados} arquivo(s) novo(s) · ${pulados} já existiam · ${falhas} falha(s) · ${clientesComDoc} clientes com documento (de ${fila.length}).`)
