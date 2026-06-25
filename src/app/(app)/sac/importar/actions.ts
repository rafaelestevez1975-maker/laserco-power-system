'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'

export type LinhaImport = { nome: string; telefone?: string; email?: string; cpf?: string; motivo?: string; obs?: string }
export type ImportResult = { ok: boolean; error?: string; inseridos?: number; ignorados?: number }

const CANAIS = ['Reclame Aqui', 'Procon', 'Sults', 'Blip', 'WhatsApp', 'E-mail', 'Instagram', 'Telefone', 'Manual', 'Formulário']
const MAX = 5000

/** Importa reclamações de planilha (Reclame Aqui/Procon/Sults/CSV) como chamados SAC em lote. */
export async function importarTickets(payload: { linhas: LinhaImport[]; canal: string; unidadeId: string | null }): Promise<ImportResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, 'sac', 'gestor')) return { ok: false, error: 'Você não tem permissão para importar chamados.' }
  const sb = op.sb

  const canal = CANAIS.includes(payload.canal) ? payload.canal : 'Manual'
  const linhas = (payload.linhas || []).filter((l) => l.nome?.trim()).slice(0, MAX)
  if (linhas.length === 0) return { ok: false, error: 'Nenhuma linha com nome de cliente para importar.' }
  const ignorados = (payload.linhas?.length ?? 0) - linhas.length

  // empresa_id: da unidade escolhida, senão a empresa única
  let empresa_id: string | undefined
  if (payload.unidadeId) {
    const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', payload.unidadeId).single()
    empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  } else {
    const { data: emp } = await sb.from('empresas').select('id').limit(1).single()
    empresa_id = (emp as { id?: string } | null)?.id
  }
  if (!empresa_id) return { ok: false, error: 'Não foi possível determinar a empresa.' }

  const rows = linhas.map((l) => ({
    empresa_id,
    unidade_id: payload.unidadeId || null,
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
    observacoes: l.obs?.trim() || null,
  }))

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
