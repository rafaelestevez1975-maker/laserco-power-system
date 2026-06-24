/**
 * IA de atendimento do SAC (Laser&Co) — server-only.
 *
 * Provedor: OpenRouter (API compatível com OpenAI). Espelha o padrão do crm-abv.
 * Chave: OPENROUTER_API_KEY (ou AGENTE_IA_API_KEY). Modelo: OPENROUTER_MODEL
 * (padrão openai/gpt-4o-mini — barato e bom em pt-BR; pode trocar por
 * anthropic/claude-3.5-haiku, etc.). Sem chave → iaConfigurada()=false e o
 * atendimento segue manual (a IA não responde).
 */
const BASE_URL = (process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '')
const MODELO = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'

function chaveApi(): string | undefined {
  return process.env.OPENROUTER_API_KEY || process.env.AGENTE_IA_API_KEY
}
export function iaConfigurada(): boolean {
  return Boolean(chaveApi())
}
export function modeloIA(): string {
  return MODELO
}

const SISTEMA = `Você é o assistente virtual do SAC da Laser&Co, uma rede de franquias de estética e depilação a laser. Atende clientes pelo WhatsApp.

OBJETIVO: fazer a TRIAGEM do atendimento — identificar o cliente, entender o motivo e ou resolver dúvidas simples ou encaminhar para um atendente humano. Seja cordial, objetivo e 100% em português do Brasil. Mensagens curtas, tom de WhatsApp.

FORMATAÇÃO DO WHATSAPP: para negrito use UM asterisco *assim* — NUNCA use **dois** (markdown quebra no WhatsApp). Não use títulos com #, nem tabelas. No máximo 1 emoji ocasional.

COMO AGIR (uma pergunta por vez):
1) Cumprimente e pergunte o NOME do cliente (se ainda não souber).
2) Para dar continuidade com segurança, peça o CPF (ou o telefone) — é o que identifica o cadastro do cliente no sistema.
3) Entenda o MOTIVO: informação (unidades, serviços, horários), agendamento/reagendamento, cancelamento de pacote/contrato, ou reclamação.
4) Dúvidas simples de informação você pode responder de forma geral, SEM inventar dados específicos (não invente valores, número de sessões, contratos, datas ou protocolos).

QUANDO TRANSFERIR para um atendente humano (transferir=true):
- Cancelamento de pacote/contrato, pedido de reembolso/devolução, reclamação, reagendamento que dependa da agenda da unidade, qualquer assunto sensível, ou pedido explícito de falar com uma pessoa.
- Sempre que já tiver coletado nome + CPF/telefone + motivo, transfira para o atendente humano dar sequência.

NUNCA invente informações da conta do cliente. Se não souber, diga que um atendente vai verificar.

Responda SEMPRE com um JSON (e nada além do JSON) neste formato exato:
{"resposta": "<texto que vai pro cliente no WhatsApp>", "transferir": <true|false>, "motivo": "<motivo interno curto, ou string vazia>", "nomeCliente": "<nome do cliente quando souber, senão string vazia>", "cpf": "<somente dígitos do CPF/telefone quando o cliente informar, senão string vazia>"}`

export function formatarParaWhatsApp(texto: string): string {
  return texto
    .replace(/\*\*\*(.+?)\*\*\*/g, '*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\*\*/g, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/__(.+?)__/g, '*$1*')
    .trim()
}

export type MensagemHistorico = { autor: 'cliente' | 'atendente' | 'ia' | 'sistema'; texto: string }
export type RespostaIA = { resposta: string; transferir: boolean; motivo?: string; nomeCliente?: string; cpf?: string }

function parseJson(texto: string): RespostaIA | null {
  const limpo = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const ini = limpo.indexOf('{'); const fim = limpo.lastIndexOf('}')
  if (ini < 0 || fim <= ini) return null
  try {
    const d = JSON.parse(limpo.slice(ini, fim + 1)) as Partial<RespostaIA>
    if (!d.resposta) return null
    return { resposta: formatarParaWhatsApp(String(d.resposta)), transferir: Boolean(d.transferir), motivo: d.motivo || undefined, nomeCliente: d.nomeCliente || undefined, cpf: d.cpf || undefined }
  } catch { return null }
}

/** Gera a resposta da IA para o histórico da conversa. null = não configurada/falha (mantém manual). */
export async function gerarRespostaSAC(historico: MensagemHistorico[]): Promise<RespostaIA | null> {
  const apiKey = chaveApi()
  if (!apiKey) return null
  const mensagens: { role: 'system' | 'user' | 'assistant'; content: string }[] = [{ role: 'system', content: SISTEMA }]
  for (const m of historico) {
    if (!m.texto.trim()) continue
    if (m.autor === 'cliente') mensagens.push({ role: 'user', content: m.texto })
    else if (m.autor === 'sistema') mensagens.push({ role: 'user', content: `[sistema] ${m.texto}` })
    else mensagens.push({ role: 'assistant', content: m.texto })
  }
  if (!mensagens.some((m) => m.role === 'user')) return null
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://laserco-power-system.vercel.app',
        'X-Title': 'Laser&Co SAC IA',
      },
      body: JSON.stringify({ model: MODELO, messages: mensagens, max_tokens: 600, temperature: 0.4, response_format: { type: 'json_object' } }),
    })
    if (!res.ok) { console.error(`ia-sac: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`); return null }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return parseJson(data.choices?.[0]?.message?.content ?? '')
  } catch (err) {
    console.error('ia-sac: falha:', (err as Error).message)
    return null
  }
}
