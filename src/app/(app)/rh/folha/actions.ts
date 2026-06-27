'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import { calcularFolha } from '@/lib/rh'

/** Papéis que podem gerar/fechar folha. */
const PAPEIS_FOLHA = ['admin_geral', 'gestor', 'financeiro', 'rh']
const COMP_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Gera (ou regenera) a folha de uma competência para os colaboradores ATIVOS da unidade.
 *  Calcula INSS/IRRF/FGTS/Líquido a partir do salário bruto do cadastro (src/lib/rh).
 *  Upsert idempotente por (colaborador_id, competencia) — só toca folhas 'aberta'. */
export async function gerarFolha(competencia: string, unidadeId: string | null, decimo = false): Promise<{ ok: boolean; error?: string; gerados?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FOLHA)) return { ok: false, error: 'Você não tem permissão para gerar a folha.' }
  if (!COMP_RE.test(competencia)) return { ok: false, error: 'Competência inválida (use AAAA-MM).' }
  const sb = op.sb

  // Colaboradores ativos do escopo (com salário bruto cadastrado).
  let cq = sb.from('colaboradores').select('id, salario_bruto').eq('status', 'ativo').limit(2000)
  if (unidadeId) cq = cq.eq('unidade_id', unidadeId)
  const { data: colabRaw, error: ce } = await cq
  if (ce) return { ok: false, error: msgErro(ce.message, 'ler os colaboradores') }
  const colabs = (colabRaw ?? []) as { id: string; salario_bruto: number | null }[]
  if (colabs.length === 0) return { ok: false, error: 'Nenhum colaborador ativo no escopo para gerar a folha.' }

  // Não sobrescreve folhas já fechadas/pagas dessa competência.
  const ids = colabs.map((c) => c.id)
  const { data: existRaw } = await sb.from('folha_pagamento').select('colaborador_id, status').eq('competencia', competencia).in('colaborador_id', ids)
  const travadas = new Set(((existRaw ?? []) as { colaborador_id: string; status: string }[]).filter((e) => e.status !== 'aberta').map((e) => e.colaborador_id))

  const linhas = colabs
    .filter((c) => !travadas.has(c.id))
    .map((c) => {
      const f = calcularFolha(Number(c.salario_bruto) || 0)
      const decimoVal = decimo ? f.decimoTerceiro : 0
      return {
        colaborador_id: c.id,
        competencia,
        salario_bruto: f.bruto,
        inss: f.inss,
        irrf: f.irrf,
        fgts: f.fgts,
        outros_proventos: 0,
        outros_descontos: 0,
        decimo_terceiro: decimoVal,
        salario_liquido: Math.round((f.liquido + decimoVal) * 100) / 100,
        status: 'aberta',
        atualizado_em: new Date().toISOString(),
      }
    })
  if (linhas.length === 0) return { ok: false, error: 'Todas as folhas desta competência já estão fechadas/pagas.' }

  const { error: ue } = await sb.from('folha_pagamento').upsert(linhas, { onConflict: 'colaborador_id,competencia' })
  if (ue) return { ok: false, error: msgErro(ue.message, 'gerar a folha') }

  revalidatePath('/rh/folha')
  return { ok: true, gerados: linhas.length }
}

/** Altera o status de uma folha (aberta → fechada → paga). Só gestão de folha. */
export async function alterarStatusFolha(id: string, status: 'aberta' | 'fechada' | 'paga'): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FOLHA)) return { ok: false, error: 'Sem permissão para alterar a folha.' }
  if (!['aberta', 'fechada', 'paga'].includes(status)) return { ok: false, error: 'Status inválido.' }

  const { error: e } = await op.sb.from('folha_pagamento').update({ status, atualizado_em: new Date().toISOString() }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'alterar o status da folha') }
  revalidatePath('/rh/folha')
  return { ok: true }
}
