'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { temPapel, ehAdmin } from '@/lib/rbac'
import { PONTO_TIPOS as PONTO_TIPOS_LIB, haversine, dentroDaCerca, PONTO_DEFAULTS } from '@/lib/rh'

/** Tipos de marcação do legado (PONTO_TIPOS). Os valores são o enum `registros_ponto.tipo`. */
export const PONTO_TIPOS = PONTO_TIPOS_LIB
const TIPOS_VALIDOS = PONTO_TIPOS.map((t) => t.k)

/** Origem da marcação (`registros_ponto.fonte`). */
const FONTES = ['gps', 'manual', 'web']

/** Papéis que podem ajustar/criar marcações de OUTROS colaboradores (gestão de ponto). */
const PAPEIS_GESTAO = ['admin_geral', 'gestor', 'gerente', 'recepcao', 'rh']

export type RegistrarPontoInput = {
  tipo: string
  lat?: number | null
  lng?: number | null
  unidade_id?: string | null
  /** 'unidade' (presencial) ou 'casa' (home office). Define a base da cerca virtual. */
  modo?: 'unidade' | 'casa'
  /** GPS da casa (home office), capturado/definido pelo colaborador no cliente. */
  casa_lat?: number | null
  casa_lng?: number | null
}

/** Bate o PRÓPRIO ponto do colaborador logado (botões Entrada/Almoço/Saída).
 *  Resolve o colaborador pelo perfil_id do usuário; calcula a distância (Haversine)
 *  até a base (unidade ou casa) e valida a cerca virtual (dist<=raio) no servidor —
 *  porta da regra do legado (pontoMarcar, index.html ~8433-8448). */
export async function registrarPonto(input: RegistrarPontoInput): Promise<{ ok: boolean; error?: string; validado?: boolean; distancia?: number | null }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const sb = op.sb

  if (!TIPOS_VALIDOS.includes(input.tipo)) return { ok: false, error: 'Tipo de marcação inválido.' }

  // O ponto é do colaborador (RH) ligado ao perfil do usuário logado.
  const { data: colab } = await sb.from('colaboradores').select('id, unidade_id').eq('perfil_id', op.userId).maybeSingle()
  const c = colab as { id?: string; unidade_id?: string | null } | null
  if (!c?.id) return { ok: false, error: 'Seu usuário não está vinculado a um colaborador de RH. Procure o gestor.' }

  const uniId = input.unidade_id ?? c.unidade_id ?? null
  const modo: 'unidade' | 'casa' = input.modo === 'casa' ? 'casa' : 'unidade'

  // Home office sem casa definida → bloqueia (legado: "Defina o endereço de casa…").
  if (modo === 'casa' && (!Number.isFinite(input.casa_lat as number) || !Number.isFinite(input.casa_lng as number))) {
    return { ok: false, error: 'Defina o endereço de casa (home office) antes de bater o ponto.' }
  }

  // Config da cerca virtual da unidade (raio + lat/lng da base). Fallback p/ defaults.
  let raio = PONTO_DEFAULTS.raio
  let baseLat = PONTO_DEFAULTS.uni_lat
  let baseLng = PONTO_DEFAULTS.uni_lng
  if (uniId) {
    const { data: cfg } = await sb.from('ponto_config').select('raio, uni_lat, uni_lng').eq('unidade_id', uniId).maybeSingle()
    const k = cfg as { raio?: number; uni_lat?: number; uni_lng?: number } | null
    if (k) { raio = k.raio ?? raio; baseLat = k.uni_lat ?? baseLat; baseLng = k.uni_lng ?? baseLng }
  }
  if (modo === 'casa') { baseLat = Number(input.casa_lat); baseLng = Number(input.casa_lng) }

  const lat = Number.isFinite(input.lat as number) ? (input.lat as number) : null
  const lng = Number.isFinite(input.lng as number) ? (input.lng as number) : null
  const fonte = lat != null && lng != null ? 'gps' : 'manual'

  // Distância + validação da cerca (Haversine). Sem GPS → distância/validação nulas.
  let distancia: number | null = null
  let validado: boolean | null = null
  if (lat != null && lng != null) {
    const d = haversine(lat, lng, baseLat, baseLng)
    distancia = Math.round(d)
    validado = dentroDaCerca(d, raio)
  }

  const { error: e } = await sb.from('registros_ponto').insert({
    colaborador_id: c.id,
    unidade_id: uniId,
    tipo: input.tipo,
    data_hora: new Date().toISOString(),
    lat,
    lng,
    distancia_m: distancia,
    validado_geo: validado,
    modo,
    fonte,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'registrar o ponto') }

  revalidatePath('/ponto')
  return { ok: true, validado: validado ?? undefined, distancia }
}

export type PontoConfig = {
  raio: number
  uni_lat: number
  uni_lng: number
  maps_key: string
  modo_padrao: 'unidade' | 'casa'
}

/** Salva a configuração do ponto (chave Maps, raio, lat/lng) da unidade ativa.
 *  Só admin — porta do bloco admin do legado (pontoCfgSalvar, index.html ~8450). */
export async function salvarPontoConfig(unidadeId: string | null, cfg: PontoConfig): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas administradores configuram a cerca virtual do ponto.' }
  if (!unidadeId) return { ok: false, error: 'Selecione uma unidade ativa no topo para configurar o ponto.' }
  const sb = op.sb

  const raio = Number.isFinite(cfg.raio) ? Math.max(1, Math.round(cfg.raio)) : PONTO_DEFAULTS.raio
  const lat = Number.isFinite(cfg.uni_lat) ? cfg.uni_lat : PONTO_DEFAULTS.uni_lat
  const lng = Number.isFinite(cfg.uni_lng) ? cfg.uni_lng : PONTO_DEFAULTS.uni_lng

  const { error: e } = await sb.from('ponto_config').upsert(
    {
      unidade_id: unidadeId,
      raio,
      uni_lat: lat,
      uni_lng: lng,
      maps_key: (cfg.maps_key || '').trim(),
      modo_padrao: cfg.modo_padrao === 'casa' ? 'casa' : 'unidade',
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'unidade_id' },
  )
  if (e) return { ok: false, error: msgErro(e.message, 'salvar a configuração do ponto') }

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
