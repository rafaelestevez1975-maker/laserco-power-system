'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'

/** Tipos de marcação do legado (PONTO_TIPOS). Os valores são o enum `registros_ponto.tipo`. */
export const PONTO_TIPOS: { k: string; l: string; ic: string }[] = [
  { k: 'entrada', l: 'Entrada', ic: 'ti-login-2' },
  { k: 'saida_almoco', l: 'Saída p/ almoço', ic: 'ti-coffee' },
  { k: 'volta_almoco', l: 'Retorno do almoço', ic: 'ti-arrow-back-up' },
  { k: 'saida', l: 'Saída', ic: 'ti-logout-2' },
]
const TIPOS_VALIDOS = PONTO_TIPOS.map((t) => t.k)

/** Origem da marcação (`registros_ponto.fonte`). */
const FONTES = ['gps', 'manual', 'web']

/** Papéis que podem ajustar/criar marcações de OUTROS colaboradores (gestão de ponto). */
const PAPEIS_GESTAO = ['admin_geral', 'gestor', 'gerente', 'recepcao', 'rh']

export type RegistrarPontoInput = {
  tipo: string
  lat?: number | null
  lng?: number | null
  validado_geo?: boolean
  unidade_id?: string | null
}

/** Bate o PRÓPRIO ponto do colaborador logado (botões Entrada/Almoço/Saída).
 *  Resolve o colaborador pelo perfil_id do usuário; grava fonte 'gps' quando há coordenadas. */
export async function registrarPonto(input: RegistrarPontoInput): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const sb = op.sb

  if (!TIPOS_VALIDOS.includes(input.tipo)) return { ok: false, error: 'Tipo de marcação inválido.' }

  // O ponto é do colaborador (RH) ligado ao perfil do usuário logado.
  const { data: colab } = await sb.from('colaboradores').select('id, unidade_id').eq('perfil_id', op.userId).maybeSingle()
  const c = colab as { id?: string; unidade_id?: string | null } | null
  if (!c?.id) return { ok: false, error: 'Seu usuário não está vinculado a um colaborador de RH. Procure o gestor.' }

  const lat = Number.isFinite(input.lat as number) ? (input.lat as number) : null
  const lng = Number.isFinite(input.lng as number) ? (input.lng as number) : null
  const fonte = lat != null && lng != null ? 'gps' : 'manual'

  const { error: e } = await sb.from('registros_ponto').insert({
    colaborador_id: c.id,
    unidade_id: input.unidade_id ?? c.unidade_id ?? null,
    tipo: input.tipo,
    data_hora: new Date().toISOString(),
    lat,
    lng,
    validado_geo: !!input.validado_geo,
    fonte,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'registrar o ponto') }

  revalidatePath('/ponto')
  return { ok: true }
}

export type AjustePontoInput = {
  colaborador_id: string
  tipo: string
  data_hora: string // ISO (datetime-local convertido)
  fonte?: string
  validado_geo?: boolean
  lat?: number | string | null
  lng?: number | string | null
  motivo_ajuste?: string
  unidade_id?: string | null
}

function parseCoord(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Lança/ajusta uma marcação de QUALQUER colaborador (espelho de ponto da unidade).
 *  Só gestão de ponto. Registra `ajustado_por` + `motivo_ajuste` (auditoria). */
export async function criarAjustePonto(input: AjustePontoInput): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_GESTAO)) return { ok: false, error: 'Você não tem permissão para lançar ponto de colaboradores.' }
  const sb = op.sb

  if (!input.colaborador_id) return { ok: false, error: 'Selecione o colaborador.' }
  if (!TIPOS_VALIDOS.includes(input.tipo)) return { ok: false, error: 'Tipo de marcação inválido.' }
  const dt = new Date(input.data_hora)
  if (isNaN(dt.getTime())) return { ok: false, error: 'Data/hora inválida.' }
  const fonte = FONTES.includes(input.fonte || '') ? input.fonte! : 'manual'

  // unidade do colaborador escolhido (fallback p/ a passada)
  const { data: colab } = await sb.from('colaboradores').select('unidade_id').eq('id', input.colaborador_id).maybeSingle()
  const uniColab = (colab as { unidade_id?: string | null } | null)?.unidade_id ?? null

  const { error: e } = await sb.from('registros_ponto').insert({
    colaborador_id: input.colaborador_id,
    unidade_id: input.unidade_id ?? uniColab,
    tipo: input.tipo,
    data_hora: dt.toISOString(),
    lat: parseCoord(input.lat),
    lng: parseCoord(input.lng),
    validado_geo: !!input.validado_geo,
    fonte,
    ajustado_por: op.userId,
    motivo_ajuste: input.motivo_ajuste?.trim() || 'Lançamento manual pela gestão',
  })
  if (e) return { ok: false, error: msgErro(e.message, 'lançar o ponto') }

  revalidatePath('/ponto')
  return { ok: true }
}

export type EditarPontoInput = {
  id: string
  tipo?: string
  data_hora?: string
  validado_geo?: boolean
  motivo_ajuste?: string
}

/** Edita uma marcação existente (corrige tipo/horário/validação). Só gestão de ponto. */
export async function editarPonto(input: EditarPontoInput): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_GESTAO)) return { ok: false, error: 'Você não tem permissão para ajustar marcações.' }
  const sb = op.sb

  if (!input.id) return { ok: false, error: 'Marcação inválida.' }
  if (input.tipo && !TIPOS_VALIDOS.includes(input.tipo)) return { ok: false, error: 'Tipo de marcação inválido.' }

  const patch: Record<string, unknown> = { ajustado_por: op.userId }
  if (input.tipo) patch.tipo = input.tipo
  if (input.data_hora !== undefined) {
    const dt = new Date(input.data_hora)
    if (isNaN(dt.getTime())) return { ok: false, error: 'Data/hora inválida.' }
    patch.data_hora = dt.toISOString()
  }
  if (input.validado_geo !== undefined) patch.validado_geo = !!input.validado_geo
  patch.motivo_ajuste = input.motivo_ajuste?.trim() || 'Ajuste manual pela gestão'

  const { error: e } = await sb.from('registros_ponto').update(patch).eq('id', input.id)
  if (e) return { ok: false, error: msgErro(e.message, 'ajustar a marcação') }

  revalidatePath('/ponto')
  return { ok: true }
}
