/** Tipos compartilhados do módulo RH · Desempenho (server page ↔ client components). */

export type ColabOpt = { id: string; nome: string; cargo: string | null }

export type AvaliacaoRow = {
  id: string
  colaborador_id: string
  colaboradorNome: string
  avaliador_id: string | null
  periodo: string | null
  nota_produtividade: number | null
  nota_qualidade: number | null
  nota_comportamento: number | null
  nota_trabalho_equipe: number | null
  nota_geral: number | null
  observacoes: string | null
  criado_em: string | null
}

export type PdiRow = {
  id: string
  colaborador_id: string
  colaboradorNome: string
  responsavel_id: string | null
  titulo: string | null
  descricao: string | null
  prazo: string | null
  status: string | null
  progresso: number | null
  criado_em: string | null
  atualizado_em: string | null
}

export type MetaResumo = {
  id: string
  colaborador_id: string
  colaboradorNome: string
  indicador: string | null
  valor_alvo: number | null
  valor_realizado: number | null
  status: string | null
}

export type DesempenhoKpis = {
  avaliacoes: number
  notaMedia: number | null
  colaboradores: number
  semAvaliacao: number
  pdisAtivos: number
  metasBatidas: number
}
