// Tipos compartilhados do módulo Expansão (CRM de franquia).

export type ExpEtapa = { id: string; nome: string; cor: string }

export type ExpLead = {
  id: string
  nome: string | null
  telefone: string | null
  email: string | null
  origem: string | null
  valor_estimado: number | null
  etapa_id: string | null
  status: string | null
  tipo_lead: string | null
  temperatura: string | null
  criado_em: string | null
}

export type ExpUnidade = { id: string; nome: string }

// Tipos de lead (linhas de oferta) — legado EXP_TIPOS (apenas os 3 principais).
export const TIPOS_LEAD: { label: string; cor: string }[] = [
  { label: 'Ultracell', cor: '#2f44a0' },
  { label: 'Quanta', cor: '#0d9488' },
  { label: 'Franquia', cor: '#b7791f' },
]

// Temperatura — legado EXP_TEMPS (simplificado para frio/morno/quente).
export const TEMPERATURAS: { k: string; label: string; cor: string }[] = [
  { k: 'frio', label: 'Frio', cor: '#06b6d4' },
  { k: 'morno', label: 'Morno', cor: '#f59e0b' },
  { k: 'quente', label: 'Quente', cor: '#ef4444' },
]

export function corTipo(label: string | null | undefined): string {
  return TIPOS_LEAD.find((t) => t.label === label)?.cor ?? '#64748b'
}

export function metaTemp(k: string | null | undefined): { label: string; cor: string } {
  return TEMPERATURAS.find((t) => t.k === k) ?? { label: '—', cor: '#94a3b8' }
}
