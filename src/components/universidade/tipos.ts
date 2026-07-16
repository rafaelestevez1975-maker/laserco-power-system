import type { Questao } from '@/lib/marketing'

/**
 * Tipos compartilhados da Universidade Corporativa (uni_trilhas / uni_etapas / uni_progresso).
 * Arquivo SEM 'use client' nem 'use server' — só tipos, importável por server e client.
 *
 * O YouTube saiu da UI (cliente quer SÓ Bunny): a etapa do ALUNO só carrega `bunnyEmbed`
 * (URL do player iframe já resolvida no servidor). A coluna `yt` do banco continua existindo
 * e é preservada nos saves de edição (EtapaEdit.yt), mas não aparece em tela.
 */

/** Etapa como o ALUNO consome — player já resolvido no servidor. */
export type Etapa = {
  id: string
  ordem: number
  nome: string
  bunny_guid: string | null
  bunnyEmbed: string | null
  min: number
  prova: Questao[]
}

/** Prova final (etapa is_final) na visão do aluno. */
export type ProvaFinal = {
  id: string
  nome: string
  bunny_guid: string | null
  bunnyEmbed: string | null
  min: number
  prova: Questao[]
}

export type Trilha = {
  id: string
  slug: string
  nome: string
  role: string
  cor: string
  prazo: string
  etapas: Etapa[]
  final: ProvaFinal | null
}

/** key = `${trilhaId}:${etapaKey}` (etapaKey = ordem da etapa ou 'final'). */
export type ProgressoUsuario = Record<string, { concluido: boolean; nota: number | null }>

export type AlunoRow = {
  perfilId: string
  nome: string
  cargo: string
  trilhaId: string
  trilhaNome: string
  prog: number
  nota: number
  prazo: string
  status: string
}

/** Etapa como o ADMIN edita — inclui `is_final`, `ordem` e `yt` (preservado no save). */
export type EtapaEdit = {
  id: string
  ordem: number
  nome: string
  yt: string | null
  bunny_guid: string | null
  bunnyEmbed: string | null
  min: number
  prova: Questao[]
  is_final: boolean
}

export type TrilhaEdit = {
  id: string
  slug: string
  nome: string
  role: string
  cor: string
  prazo: string
  etapas: EtapaEdit[]
  final: EtapaEdit | null
}
