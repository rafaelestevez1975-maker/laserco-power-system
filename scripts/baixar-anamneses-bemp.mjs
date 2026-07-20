/**
 * ROBÔ das ANAMNESES / TERMOS do BEMP → PDF → Bunny (bucket clientes-docs), vínculo no Supabase.
 *
 * O que salva: os documentos clínicos/jurídicos de cada cliente — Anamnese Digital (ficha
 * clínica), Termo de Realização de Sessão (evolução, parâmetros de potência, profissional +
 * registro no conselho, assinaturas), Autorização de Uso de Imagem/para Menor, Termo de
 * Ratificação de Contrato, Transferência de Pacotes, Troca por Crédito, Cancelamento.
 *
 * Por que renderizar: não existe rota GET por evento (/customer_events/<id> é DELETE → 500)
 * nem PDF no servidor. O conteúdo completo vem no fragmento AJAX /customers/<id>/events?page=N,
 * que é um PARCIAL sem CSS. Então: abrimos uma página real do BEMP (carrega o CSS do app),
 * injetamos o fragmento no body e imprimimos em PDF — 1 PDF por página de eventos.
 *
 * Roda a partir de spmssystem-main (usa o playwright de lá):
 *   node baixar-anamneses-bemp.mjs [maxClientes]
 * Idempotente (pula arquivo_path já registrado), timeouts, N workers (env ANAMNESE_CONC).
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
const N = Number(ENV.ANAMNESE_CONC || 3)
const MAX_PAG = 25
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

// idempotência
const feitos = new Set()
for (let off = 0; ; off += 1000) {
  let rows = []
  try { rows = await (await fetch(`${SB}/rest/v1/clientes_documentos?tipo=eq.anamnese&select=arquivo_path&limit=1000&offset=${off}`, { headers: H, signal: AbortSignal.timeout(30000) })).json() } catch { break }
  if (!Array.isArray(rows) || !rows.length) break
  rows.forEach((r) => feitos.add(r.arquivo_path))
  if (rows.length < 1000) break
}
console.log(`${feitos.size} páginas de anamnese já registradas (serão puladas).`)

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const ctx = await b.newContext()
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

let pdfs = 0, pulados = 0, falhas = 0, semEvento = 0, feitosCli = 0, eventos = 0

async function processarCliente(cid, pg) {
  for (let pagina = 1; pagina <= MAX_PAG; pagina++) {
    let html = ''
    try { html = await ctxText(`${BASE}/customers/${cid}/events?page=${pagina}`) } catch { falhas++; return }
    const nEventos = (html.match(/timeline-item/g) || []).length
    if (!/\/customer_events\/\d+/.test(html) || nEventos === 0) { if (pagina === 1) semEvento++; return }
    eventos += nEventos

    const path = `bemp/${cid}/anamnese/eventos-p${pagina}.pdf`
    if (feitos.has(path)) { pulados++; continue }

    let pdf = null
    try {
      // injeta o fragmento na página (que já tem o CSS do BEMP carregado) e espera as imagens
      await pg.evaluate((frag) => {
        document.body.innerHTML = `<div class="container-fluid" style="padding:16px">${frag}</div>`
        document.querySelectorAll('.header-actions, .pagination-frame, .timeline-footer').forEach((e) => e.remove())
      }, html)
      await pg.evaluate(async () => {
        const imgs = Array.from(document.images)
        await Promise.race([
          Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r })))),
          new Promise((r) => setTimeout(r, 15000)),
        ])
        // O Chromium embute a imagem na resolução ORIGINAL: com as fotos de tratamento
        // (JPEG ~2 MB cada) o PDF chegou a 225 MB. As fotos já estão salvas uma a uma no
        // Bunny (tipo='foto'), então aqui ficam só as ASSINATURAS (PNG pequeno) e o texto.
        for (const img of Array.from(document.images)) {
          if (img.naturalWidth > 700) {
            const nota = document.createElement('div')
            nota.textContent = '[foto do tratamento — arquivo salvo separadamente na aba Documentos]'
            nota.style.cssText = 'font-size:10px;color:#888;border:1px dashed #ccc;padding:6px;margin:4px 0;border-radius:4px'
            img.replaceWith(nota)
          } else {
            img.style.maxWidth = '100%'
          }
        }
      })
      await pg.waitForTimeout(300)
      const buf = await pg.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } })
      if (buf && buf.length > 1000) pdf = buf
      else console.error(`  render ${cid} p${pagina}: PDF vazio/pequeno (${buf?.length ?? 0}b)`)
    } catch (e) { console.error(`  render ${cid} p${pagina}: ${e?.message || e}`) }
    if (!pdf) { falhas++; continue }
    if (!(await subirBunny(path, pdf))) { falhas++; console.error(`  bunny falhou: ${path} (${pdf.length}b)`); continue }
    try {
      const ins = await fetch(`${SB}/rest/v1/clientes_documentos`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ bemp_customer_id: Number(cid), tipo: 'anamnese', titulo: `Anamneses e termos — página ${pagina}`, arquivo_path: path, mime: 'application/pdf', tamanho_bytes: pdf.length, origem: 'bemp', baixado_em: new Date().toISOString() }),
        signal: AbortSignal.timeout(30000),
      })
      if (ins.status === 409) { pulados++; feitos.add(path); continue }
      if (!ins.ok) { falhas++; console.error(`  insert HTTP ${ins.status}: ${(await ins.text()).slice(0, 160)}`); continue }
      feitos.add(path); pdfs++
    } catch (e) { falhas++; console.error(`  insert erro: ${e?.message || e}`) }
  }
}

let qi = 0
await Promise.all(Array.from({ length: N }, async () => {
  const pg = await ctx.newPage()
  // carrega uma página real do BEMP só para ter o CSS do app no documento
  await pg.goto(`${BASE}/schedules`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await pg.waitForTimeout(1000)
  while (qi < fila.length) {
    const cid = fila[qi++]
    try { await processarCliente(cid, pg) } catch (e) { falhas++; console.error(`cliente ${cid}: ${e?.message || e}`) }
    feitosCli++
    if (feitosCli % 25 === 0) console.log(`[${feitosCli}/${fila.length}] PDFs=${pdfs} eventos_vistos=${eventos} pulados=${pulados} falhas=${falhas} sem_evento=${semEvento}`)
  }
  await pg.close().catch(() => {})
}))
await b.close().catch(() => {})
console.log(`\nFIM: ${pdfs} PDF(s) novo(s) · ${pulados} já existiam · ${falhas} falha(s) · ${eventos} eventos · ${semEvento} clientes sem evento (de ${fila.length}).`)
