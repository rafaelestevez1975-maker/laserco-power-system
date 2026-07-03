'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import { montarObs } from '@/lib/sac'

/** Uma linha já mapeada pelo cliente. `canal`/`unidadeId` são por-linha (legado lê r.Canal/r.Unidade
 *  linha a linha); quando vazios caem no padrão do lote (payload.canal / payload.unidadeId). */
export type LinhaImport = {
  nome: string
  telefone?: string
  email?: string
  cpf?: string
  motivo?: string
  obs?: string
  valor_pago?: string
  valor_devolucao?: string
  data?: string
  data_reembolso?: string
  canal?: string
  /** id de unidade já resolvido pelo cliente (a partir do nome da coluna "Unidade"). */
  unidadeId?: string | null
  multa?: string
  pago?: string
}
export type ImportResult = { ok: boolean; error?: string; inseridos?: number; ignorados?: number }

// Espelha os canais de NovoChamado/criarChamado (CHECK do banco). Tudo fora disso vira "Manual".
const CANAIS = ['Manual', 'WhatsApp', 'E-mail', 'Reclame Aqui', 'Procon', 'Telefone', 'Instagram', 'Sults', 'Blip', 'Formulário']
const MAX = 5000

/** "1.234,56" / "1234.56" / "R$ 80" → número (ou null). */
function parseNum(v?: string | null): number | null {
  if (!v) return null
  const t = String(v).trim().replace(/[R$\s]/g, '')
  if (!t) return null
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}

/** "sim/s/x/1/true/verdadeiro/pago/aplicada" → true; resto → false. Vazio = false (igual ao legado). */
function parseBool(v?: string | null): boolean {
  const t = String(v ?? '').trim().toLowerCase()
  if (!t) return false
  return /^(sim|s|x|1|t|true|v|verdadeiro|y|yes|ok|pago|paga|aplicad[ao]|realizad[ao])$/.test(t)
}

/** Normaliza um canal vindo da planilha contra os CHECKs (case/acentos), senão null (cai no default). */
function normCanal(v?: string | null): string | null {
  const t = String(v ?? '').trim()
  if (!t) return null
  const exato = CANAIS.find((c) => c.toLowerCase() === t.toLowerCase())
  return exato ?? null
}

/** Importa reclamações de planilha (Reclame Aqui/Procon/Sults/CSV) como chamados SAC em lote.
 *  Canal e unidade podem vir POR LINHA (colunas mapeadas)  paridade com o legado (r.Canal/r.Unidade);
 *  quando ausentes na linha, usa o padrão do lote (canalPadrao / unidadeIdPadrao). */
export async function importarTickets(payload: {
  linhas: LinhaImport[]
  canalPadrao: string
  unidadeIdPadrao: string | null
  unidadesPermitidas?: string[]
}): Promise<ImportResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, 'sac', 'gestor')) return { ok: false, error: 'Você não tem permissão para importar chamados.' }
  const sb = op.sb

  const canalPadrao = normCanal(payload.canalPadrao) ?? 'Manual'
  const linhas = (payload.linhas || []).filter((l) => l.nome?.trim()).slice(0, MAX)
  if (linhas.length === 0) return { ok: false, error: 'Nenhuma linha com nome de cliente para importar.' }
  const ignorados = (payload.linhas?.length ?? 0) - linhas.length

  // Set de unidades que o operador pode usar (validação extra à RLS; o select do cliente já filtra).
  const permitidas = new Set((payload.unidadesPermitidas ?? []).filter(Boolean))
  const unidadeIdPadrao = payload.unidadeIdPadrao && permitidas.has(payload.unidadeIdPadrao) ? payload.unidadeIdPadrao : null

  // empresa_id por unidade (cache)  chamados sem unidade caem na empresa única.
  const empresaPorUnidade = new Map<string, string | null>()
  async function resolverEmpresa(unidadeId: string | null): Promise<string | undefined> {
    if (unidadeId) {
      if (empresaPorUnidade.has(unidadeId)) return empresaPorUnidade.get(unidadeId) ?? undefined
      const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
      const e = (uni as { empresa_id?: string } | null)?.empresa_id ?? null
      empresaPorUnidade.set(unidadeId, e)
      return e ?? undefined
    }
    if (!empresaPorUnidade.has('')) {
      const { data: emp } = await sb.from('empresas').select('id').limit(1).single()
      empresaPorUnidade.set('', (emp as { id?: string } | null)?.id ?? null)
    }
    return empresaPorUnidade.get('') ?? undefined
  }

  // Pré-resolve a empresa default (e valida que existe alguma).
  const empresaPadrao = await resolverEmpresa(unidadeIdPadrao)
  if (!empresaPadrao && !unidadeIdPadrao) return { ok: false, error: 'Não foi possível determinar a empresa.' }

  const rows: Record<string, unknown>[] = []
  for (const l of linhas) {
    // Unidade por linha (já resolvida a id pelo cliente) só vale se estiver no escopo permitido.
    const unidadeLinha = l.unidadeId && permitidas.has(l.unidadeId) ? l.unidadeId : unidadeIdPadrao
    const empresa_id = await resolverEmpresa(unidadeLinha)
    if (!empresa_id) return { ok: false, error: 'Não foi possível determinar a empresa do chamado.' }

    const canal = normCanal(l.canal) ?? canalPadrao
    // Data da reclamação e (se houver) data do reembolso vão no prefixo das observações
    //  mesmo padrão de NovoChamado/montarObs (sac_tickets não tem colunas próprias p/ datas).
    const dataTxt = (l.data || '').trim()
    const reembTxt = (l.data_reembolso || '').trim()
    const texto = [l.obs?.trim() || '', reembTxt ? `Reembolso em: ${reembTxt}` : ''].filter(Boolean).join(' · ')
    const observacoes = montarObs('', dataTxt, texto)

    rows.push({
      empresa_id,
      unidade_id: unidadeLinha,
      nome_cliente: l.nome.trim(),
      telefone_cliente: l.telefone?.trim() || null,
      email_cliente: l.email?.trim() || null,
      cpf_cliente: l.cpf?.replace(/\D/g, '') || null,
      assunto: l.motivo?.trim() || 'Importado',
      motivo_label: l.motivo?.trim() || null,
      canal,
      status: 'aberto',
      prioridade: 'media',
      fase: 'Novo',
      valor_pago: parseNum(l.valor_pago),
      valor_devolucao: parseNum(l.valor_devolucao),
      multa_aplicada: parseBool(l.multa),
      pago: parseBool(l.pago),
      observacoes,
    })
  }

  // insere em lotes de 500
  let inseridos = 0
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500)
    const { error: e, count } = await sb.from('sac_tickets').insert(lote, { count: 'exact' })
    if (e) return { ok: false, error: msgErro(e.message, 'importar chamados') + (inseridos ? ` (${inseridos} já inseridos antes do erro)` : '') }
    inseridos += count ?? lote.length
  }

  revalidatePath('/sac/chamados'); revalidatePath('/sac'); revalidatePath('/sac/kanban')
  return { ok: true, inseridos, ignorados }
}
