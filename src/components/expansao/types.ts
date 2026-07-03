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
  empresa: string | null
  uf: string | null
  criado_em: string | null
}

export type ExpUnidade = { id: string; nome: string }

// Tipos de lead (linhas de oferta)  legado EXP_TIPOS (8537): 5 linhas de oferta.
export const TIPOS_LEAD: { label: string; cor: string }[] = [
  { label: 'Ultracell', cor: '#2f44a0' },
  { label: 'Quanta', cor: '#0d9488' },
  { label: 'Franquia', cor: '#b7791f' },
  { label: 'Ultracell Pro', cor: '#3f5bd6' },
  { label: 'Quanta Light', cor: '#06b6d4' },
]

// Temperatura  legado EXP_TEMPS (8539): 5 níveis com as cores do cliente.
export const TEMPERATURAS: { k: string; label: string; cor: string }[] = [
  { k: 'gelado', label: 'Gelado', cor: '#3b82f6' },
  { k: 'frio', label: 'Frio', cor: '#06b6d4' },
  { k: 'morno', label: 'Morno', cor: '#f59e0b' },
  { k: 'quente', label: 'Quente', cor: '#f97316' },
  { k: 'ardente', label: 'Ardente', cor: '#ef4444' },
]

export function corTipo(label: string | null | undefined): string {
  return TIPOS_LEAD.find((t) => t.label === label)?.cor ?? '#64748b'
}

export function metaTemp(k: string | null | undefined): { label: string; cor: string } {
  return TEMPERATURAS.find((t) => t.k === k) ?? { label: '', cor: '#94a3b8' }
}

// ─── Listas de disparo / Captação ───
// Legado EXP_LISTS (8545): listas disponíveis para disparo (base do sistema / importada / captação).
export type ExpLista = { nome: string; qtd: number; fonte: 'Sistema' | 'Importada' | 'Captação' }

// Legado EXP_DISPAROS (8546): histórico de campanhas com métricas de envio.
export type ExpDisparo = {
  nome: string
  lista: string
  env: number
  entr: number
  resp: number
  status: 'Concluído' | 'Em andamento'
}
