/**
 * ROBÔ de resgate dos DOCUMENTOS dos clientes no BEMP (fotos, anamneses, termos, contratos).
 * Autorizado pelo cliente em 04/07/2026 ("pode fazer")  a API do BEMP NÃO expõe arquivos
 * (docs/BACKLOG.md EPIC 14.1), então o caminho é o APP WEB, um cliente por vez, começando
 * pelos 8.363 com pacote em andamento (docs/clientes-pacote-andamento-90d.csv).
 *
 * DESTINO (já provisionado 04/07):
 *   - Storage bucket `clientes-docs` (privado)  path bemp/<customer_id>/<tipo>/<arquivo>
 *   - Tabela `clientes_documentos` (cliente_id via bemp_id, tipo, arquivo_path, mime, …)
 *
 * FALTA (único elo pendente): o LOGIN do app web do BEMP.
 *   Defina em ../.env.local:  BEMP_WEB_BASE=…  BEMP_WEB_EMAIL=…  BEMP_WEB_SENHA=…
 *   Com o login em mãos: 1) mapear a rota de auth e as rotas de documentos do cliente
 *   (uma sessão de inspeção no DevTools resolve  os endpoints entram em fetchDocsDoCliente),
 *   2) rodar:  node scripts/baixar-docs-bemp.mjs [maxClientes]
 *
 * Regras de execução: ritmo lento (1 cliente/2s  não derrubar o BEMP), idempotente
 * (pula documento já registrado em clientes_documentos), tolerante a falha (loga e segue).
 */
import { readFileSync } from 'fs'

const lerEnv = (p) => Object.fromEntries(readFileSync(p, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const env = lerEnv(new URL('../.env.local', import.meta.url).pathname)

// APP WEB DO BEMP  MAPEADO em 05/07 (login lucas@lasercompany.com confirmado):
//   Base (tenant Laser):  https://laserco.bemp.app
//   Login (Rails/Devise): POST /users/sign_in  com os campos:
//     user[organization][subdomain] = laserco
//     user[username] = <email>      user[password] = <senha>
//     authenticity_token = <csrf da página /users/sign_in>
//   Rotas úteis logado: /customers, /schedules, /custom_entities/customer_event,
//     /customer_contract_templates, /report/*  (fotos/anamneses ficam no detalhe do cliente).
//
// BLOQUEIO ATUAL: a conta lucas@lasercompany.com cai numa TAREFA OBRIGATÓRIA de 1º acesso
// (/mandatory_task/profile/edit) que exige DEFINIR UMA SENHA PERMANENTE e trava todo o resto
// (clientes/documentos) até ser concluída. Concluir mudaria a senha e invalidaria a credencial
// 123456  então NÃO fazemos isso. Peça ao Lucas para: 1) entrar no BEMP, 2) completar o "Perfil"
// (definir a senha definitiva), 3) repassar a nova senha. Aí este robô destrava e mapeia os docs.
const BEMP_WEB_BASE = env.BEMP_WEB_BASE || 'https://laserco.bemp.app'
const { BEMP_WEB_EMAIL, BEMP_WEB_SENHA } = env
if (!BEMP_WEB_EMAIL || !BEMP_WEB_SENHA) {
  console.error(`Defina no .env.local a credencial JÁ com a tarefa obrigatória concluída:
  BEMP_WEB_EMAIL=lucas@lasercompany.com
  BEMP_WEB_SENHA=<senha DEFINITIVA, depois que o Lucas completar o Perfil no BEMP>
Destino já pronto: bucket clientes-docs + tabela clientes_documentos + fila (8.363 c/ pacote).`)
  process.exit(2)
}

// ── A partir daqui o fluxo está pronto; os dois TODO dependem de inspecionar o app logado. ──
const SB = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
const MAX = Number(process.argv[2]) || Infinity

async function loginBemp() {
  // TODO(1 sessão de DevTools): POST de login do app (rota, campos, cookie/bearer de sessão).
  throw new Error('mapear rota de login do app BEMP (aguardando credenciais)')
}
async function fetchDocsDoCliente(_sessao, _customerId) {
  // TODO: rotas de fotos/anamneses/termos do cliente no app; devolve [{tipo, titulo, url, mime}].
  throw new Error('mapear rotas de documentos (aguardando credenciais)')
}

const csv = readFileSync(new URL('../docs/clientes-pacote-andamento-90d.csv', import.meta.url), 'utf8')
const clientes = csv.split('\n').slice(1).filter(Boolean).map((l) => ({ id: l.split(',')[0], nome: l.split(',').slice(1).join(',') }))
console.log(`${clientes.length} clientes na fila de prioridade (pacote em andamento).`)

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const sessao = await loginBemp()
let baixados = 0, pulados = 0, falhas = 0
for (const cli of clientes.slice(0, MAX)) {
  try {
    const docs = await fetchDocsDoCliente(sessao, cli.id)
    for (const d of docs) {
      const nomeArq = d.url.split('/').pop().split('?')[0] || `doc-${Date.now()}`
      const path = `bemp/${cli.id}/${d.tipo}/${nomeArq}`
      // idempotência: já registrado?
      const ja = await (await fetch(`${SB}/rest/v1/clientes_documentos?select=id&arquivo_path=eq.${encodeURIComponent(path)}&limit=1`, { headers: H })).json()
      if (ja.length) { pulados++; continue }
      const bin = await (await fetch(d.url, { headers: sessao.headers })).arrayBuffer()
      const up = await fetch(`${SB}/storage/v1/object/clientes-docs/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': d.mime || 'application/octet-stream' }, body: Buffer.from(bin) })
      if (!up.ok) { falhas++; continue }
      await fetch(`${SB}/rest/v1/clientes_documentos`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({
        bemp_customer_id: Number(cli.id), tipo: d.tipo, titulo: d.titulo || nomeArq, arquivo_path: path, mime: d.mime || null, tamanho_bytes: bin.byteLength,
      }) })
      baixados++
    }
  } catch (e) { falhas++; console.error(cli.id, e.message) }
  await new Promise((ok) => setTimeout(ok, 2000)) // ritmo gentil com o BEMP
}
console.log(`RESULTADO: ${baixados} baixado(s) · ${pulados} já existiam · ${falhas} falha(s)`)
