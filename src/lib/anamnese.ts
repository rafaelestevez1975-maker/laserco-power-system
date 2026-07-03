/**
 * Construtor de documentos / Anamnese Digital  tipos e helpers compartilhados.
 * Paridade com o legado (legacy/index.html): typeSelect (8 tipos), fldRow (flags
 * obr/inv), DOCS_LIST/DOC_MODELS, e a regra clínica "inviabiliza" (inv:true).
 * Namespeado para este módulo  não toca em libs compartilhadas.
 */

/** 8 tipos de campo de pergunta (typeSelect 7991-7994 do legado). */
export const TIPOS_CAMPO = [
  ['simnao', 'Sim / Não'],
  ['textocurto', 'Texto curto'],
  ['textolongo', 'Texto longo'],
  ['numero', 'Número'],
  ['selecao', 'Seleção'],
  ['consent', 'Consentimento'],
  ['assinatura', 'Assinatura'],
  ['imagem', 'Imagem / Foto'],
] as const

export type TipoCampo = (typeof TIPOS_CAMPO)[number][0]
export const TIPOS_CAMPO_IDS = TIPOS_CAMPO.map((t) => t[0]) as TipoCampo[]

export function labelTipoCampo(t: string): string {
  return TIPOS_CAMPO.find((x) => x[0] === t)?.[1] ?? t
}

/** Tipo do documento (select da seção "Dados do documento"). */
export const TIPOS_DOCUMENTO = ['Anamnese', 'Ficha técnica', 'Ficha de sessão', 'Termo', 'Termo de consentimento', 'Formulário'] as const

/** Regras de preenchimento (select do legado, view-doc-editor 1587). */
export const PREENCHIMENTOS = [
  'Obrigatório para todos os clientes',
  'Opcional',
  'Somente clientes de ultrassom',
] as const

/** Status do documento (badge de 3 estados). */
export const STATUS_DOC = ['Ativo', 'Rascunho', 'Inativo'] as const
export type StatusDoc = (typeof STATUS_DOC)[number]

/** Uma pergunta/campo do construtor. */
export type Campo = {
  q: string
  t: TipoCampo
  obr?: boolean
  inv?: boolean
}

/** Uma seção do documento (título + lista de campos). */
export type Secao = {
  titulo: string
  campos: Campo[]
}

export type DocumentoRow = {
  id: string
  nome: string | null
  tipo: string | null
  descricao: string | null
  preenchimento: string | null
  obrigatorio: boolean | null
  status: string | null
  acumulativo: boolean | null
  unidades_ids: string[] | null
  secoes: Secao[] | null
  atualizado_em: string | null
}

/** Normaliza o JSONB de seções (defensivo: garante shape mínimo). */
export function normalizarSecoes(raw: unknown): Secao[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s) => {
    const sec = (s ?? {}) as Record<string, unknown>
    const campos = Array.isArray(sec.campos) ? sec.campos : []
    return {
      titulo: String(sec.titulo ?? ''),
      campos: campos.map((c) => {
        const campo = (c ?? {}) as Record<string, unknown>
        const t = String(campo.t ?? 'simnao')
        return {
          q: String(campo.q ?? ''),
          t: (TIPOS_CAMPO_IDS.includes(t as TipoCampo) ? t : 'simnao') as TipoCampo,
          obr: !!campo.obr,
          inv: !!campo.inv,
        }
      }),
    }
  })
}

/** Conta perguntas e perguntas com flag inviabiliza (resumo do documento). */
export function resumoDocumento(secoes: Secao[]): { perguntas: number; inviabiliza: number } {
  let perguntas = 0
  let inviabiliza = 0
  for (const s of secoes) {
    for (const c of s.campos) {
      perguntas++
      if (c.inv) inviabiliza++
    }
  }
  return { perguntas, inviabiliza }
}

/** Texto da coluna "Unidades com acesso" a partir do vínculo. */
export function rotuloUnidades(
  unidadesIds: string[] | null | undefined,
  nomesPorId: Record<string, string>,
): string {
  if (!unidadesIds || unidadesIds.length === 0) return 'Todas as unidades'
  const nomes = unidadesIds.map((id) => nomesPorId[id]).filter(Boolean)
  return nomes.length ? nomes.join(', ') : 'Todas as unidades'
}

/** Hint dinâmico do checkbox "Documento acumulativo de sessões" (legado 8024). */
export function acumulativoHint(acumulativo: boolean): string {
  return acumulativo
    ? 'Ativo: este termo abre uma única vez e vai acumulando o registro de cada nova sessão no histórico do cliente.'
    : 'Desativado: documento preenchido uma vez por cliente.'
}
