/**
 * ROBÔ dos CONTRATOS assinados do BEMP → PDF → Bunny (bucket clientes-docs), vínculo no Supabase.
 * O contrato no BEMP é uma PÁGINA HTML (/contrato/<token>/show); não há PDF no servidor,
 * então renderizamos a página em PDF (Chromium headless / page.pdf). tipo='contrato'.
 *
 * Roda a partir de spmssystem-main (onde está o playwright). Lê o .env.local do laserco.
 *   node baixar-contratos-bemp.mjs [maxClientes]
 * Idempotente (pula arquivo_path já registrado), timeouts, N workers (env CONTRATO_CONC).
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const LASER = '/home/jvneto/ProjetosLMK/Laser/laserco-power-system'
const ENV = Object.fromEntries(readFileSync(`${LASER}/.env.local`, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const BASE = ENV.BEMP_WEB_BASE || 'https://laserco.bemp.app'
const SB = ENV.NEXT_PUBLIC_SUPABASE_URL
const KEY = ENV.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_SERVICE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const BUNNY_HOST = ENV.BUNNY_STORAGE_HOST || 'br.storage.bunnycdn.com'
const BUNNY_ZONE = ENV.BUNNY_STORAGE_ZONE, BUNNY_KEY = ENV.BUNNY_STORAGE_KEY, BUCKET = 'clientes-docs'
const MAX = Number(process.argv[2]) || Infinity
const N = Number(ENV.CONTRATO_CONC || 4)
const CHROME = '/home/jvneto/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.message || e))
process.on('uncaughtException', (e) => console.error('uncaughtException:', e?.message || e))

async function subirBunny(path, bytes) {
  try {
    const r = await fetch(`https://${BUNNY_HOST}/${BUNNY_ZONE}/${BUCKET}/${path}`, {
      method: 'PUT', headers: { AccessKey: BUNNY_KEY, 'Content-Type': 'application/pdf' }, body: Buffer.from(bytes), signal: AbortSignal.timeout(60000),
    })
    return r.ok
  } catch { return false }
}

const clientes = readFileSync(`${LASER}/docs/clientes-pacote-andamento-90d.csv`, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split(',')[0].trim()).filter((id) => /^\d+$/.test(id))
const fila = clientes.slice(0, MAX)
console.log(`${clientes.length} clientes na fila. Processando ${fila.length} com ${N} workers.`)

// idempotência: contratos já registrados
const feitos = new Set()
for (let off = 0; ; off += 1000) {
  let rows = []
  try { rows = await (await fetch(`${SB}/rest/v1/clientes_documentos?tipo=eq.contrato&select=arquivo_path&limit=1000&offset=${off}`, { headers: H, signal: AbortSignal.timeout(30000) })).json() } catch { break }
  if (!Array.isArray(rows) || !rows.length) break
  rows.forEach((r) => feitos.add(r.arquivo_path))
  if (rows.length < 1000) break
}
console.log(`${feitos.size} contratos já registrados (serão pulados).`)

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const ctx = await b.newContext()
// login no BEMP (contexto compartilha cookies com todas as páginas)
{
  const lp = await ctx.newPage()
  await lp.goto(`${BASE}/users/sign_in`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await lp.locator('input[name="user[username]"]').fill(ENV.BEMP_WEB_EMAIL)
  await lp.locator('input[name="user[password]"]').fill(ENV.BEMP_WEB_SENHA)
  await lp.locator('button[type="submit"], input[type="submit"]').first().click()
  await lp.waitForTimeout(3000)
  console.log('login BEMP ok:', lp.url())
  await lp.close()
}

async function ctxText(url) {
  const r = await ctx.request.get(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, timeout: 45000 })
  return r.text()
}

let contratos = 0, baixados = 0, pulados = 0, falhas = 0, semContrato = 0, feitosCli = 0
async function processarCliente(cid, pg) {
  let ids = []
  try { const t = await ctxText(`${BASE}/customers/${cid}/contracts`); ids = [...new Set((t.match(/\/customer_contracts\/(\d+)\/edit/g) || []).map((x) => x.match(/\d+/)[0]))] } catch { falhas++; return }
  if (!ids.length) { semContrato++; return }
  contratos += ids.length
  for (const ctid of ids) {
    const path = `bemp/${cid}/contrato/${ctid}.pdf`
    if (feitos.has(path)) { pulados++; continue }
    // token url do iframe do contrato
    let src = null
    try { const js = await ctxText(`${BASE}/customer_contracts/${ctid}/edit?customer_id=${cid}`); src = (js.replace(/\\\//g, '/').replace(/\\"/g, '"').match(/https:\/\/[^"'\s]*\/contrato\/[^"'\s]+/) || [])[0] } catch {}
    if (!src) { falhas++; continue }
    // render em PDF
    let pdf = null
    for (let t = 0; t < 2 && !pdf; t++) {
      try {
        await pg.goto(src, { waitUntil: 'domcontentloaded', timeout: 45000 })
        await pg.waitForTimeout(1200)
        const buf = await pg.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
        if (buf && buf.length > 800) pdf = buf
      } catch {}
    }
    if (!pdf) { falhas++; continue }
    if (!(await subirBunny(path, pdf))) { falhas++; continue }
    try {
      const ins = await fetch(`${SB}/rest/v1/clientes_documentos`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ bemp_customer_id: Number(cid), tipo: 'contrato', titulo: `Contrato ${ctid}`, arquivo_path: path, mime: 'application/pdf', tamanho_bytes: pdf.length, origem: 'bemp', baixado_em: new Date().toISOString() }),
        signal: AbortSignal.timeout(30000),
      })
      if (ins.status === 409) { pulados++; feitos.add(path); continue }
      if (!ins.ok) { falhas++; continue }
      feitos.add(path); baixados++
    } catch { falhas++ }
  }
}

let ci = 0
await Promise.all(Array.from({ length: N }, async () => {
  const pg = await ctx.newPage()
  while (ci < fila.length) {
    const cid = fila[ci++]
    try { await processarCliente(cid, pg) } catch (e) { falhas++; console.error(`cliente ${cid}: ${e?.message || e}`) }
    feitosCli++
    if (feitosCli % 25 === 0) console.log(`[${feitosCli}/${fila.length}] contratos_vistos=${contratos} PDFs=${baixados} pulados=${pulados} falhas=${falhas} sem_contrato=${semContrato}`)
  }
  await pg.close().catch(() => {})
}))
await b.close().catch(() => {})
console.log(`\nFIM: ${baixados} PDF(s) novo(s) · ${pulados} já existiam · ${falhas} falha(s) · ${contratos} contratos vistos · ${semContrato} clientes sem contrato (de ${fila.length}).`)
