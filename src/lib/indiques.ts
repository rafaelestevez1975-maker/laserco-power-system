/**
 * Helpers da Gestão de Indiques (client-safe — funções puras).
 * Paridade com o legado (legacy/index.html, bloco "Indiques" ~8059-8296).
 */

/** Status do Kanban de indicados (legado IND_STATUS 8059). */
export const IND_STATUS = ['Novo', 'Em contato', 'Sem retorno', 'Agendado', 'Compareceu', 'Fechado', 'Perdido'] as const
export type IndStatus = (typeof IND_STATUS)[number]

/** Cor por status (para a bolinha/borda do card). */
export const IND_STATUS_COR: Record<string, string> = {
  Novo: '#9A6700', 'Em contato': '#3D7FD1', 'Sem retorno': '#D85563',
  Agendado: '#8A2A41', Compareceu: '#0e7490', Fechado: '#15803D', Perdido: '#D85563',
}

/**
 * Mapeamento entre o status do banco (CHECK: pendente/contatado/respondeu/agendou/
 * compareceu/comprou/desistiu) e os 7 rótulos do Kanban do legado.
 * Mantém o banco intacto e exibe os rótulos do cliente.
 *
 * BIJEÇÃO 1-pra-1: há exatamente 7 valores no banco e 7 colunas no Kanban, então
 * cada rótulo tem um valor próprio e o round-trip (mover card → salvar → recarregar)
 * preserva a coluna. Antes, 'Sem retorno' e 'Perdido' colapsavam ambos em 'desistiu'
 * (a coluna 'Sem retorno' nunca retinha cards) e 'respondeu'/'agendou' colapsavam em
 * 'Agendado'. Agora 'Sem retorno'↔'respondeu' e 'Agendado'↔'agendou' são distintos.
 */
export const DB_TO_LABEL: Record<string, IndStatus> = {
  pendente: 'Novo', contatado: 'Em contato', respondeu: 'Sem retorno',
  agendou: 'Agendado', compareceu: 'Compareceu', comprou: 'Fechado', desistiu: 'Perdido',
}
export const LABEL_TO_DB: Record<IndStatus, string> = {
  Novo: 'pendente', 'Em contato': 'contatado', 'Sem retorno': 'respondeu',
  Agendado: 'agendou', Compareceu: 'compareceu', Fechado: 'comprou', Perdido: 'desistiu',
}

/** Rótulo do Kanban a partir do status do banco. */
export function statusLabel(db: string | null | undefined): IndStatus {
  return DB_TO_LABEL[(db || 'pendente')] ?? 'Novo'
}

/** Origem da indicação (legado: Balcão (loja) | Site | Link compartilhado). */
export const IND_ORIGENS: { value: string; label: string; icon: string; cor: string }[] = [
  { value: 'balcao', label: 'Balcão (loja)', icon: 'ti-building-store', cor: '#0F6B3A' },
  { value: 'site', label: 'Site', icon: 'ti-world', cor: '#1E3A8A' },
  { value: 'link', label: 'Link compartilhado', icon: 'ti-link', cor: '#7a1f3d' },
]
export function origemLabel(v: string | null | undefined): { label: string; icon: string; cor: string } {
  return IND_ORIGENS.find((o) => o.value === (v || 'balcao')) ?? IND_ORIGENS[0]
}

/** Slug da unidade para o link de indicação (legado indSlug 8075). */
export function indSlug(u: string): string {
  return (u || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Link compartilhável da unidade (legado indLink 8076). */
export function indLink(uniNome: string): string {
  return 'https://indique.laserco.com.br/' + indSlug(uniNome)
}

/** Mensagem pronta de WhatsApp (legado indPremioHTML 8199). */
export function indMensagem(premio: string, sorteioData: string, uniNome: string, link: string): string {
  return `🎁 Indique de 3 a 5 amigos(as) e concorra a ${premio}! Sorteio ${sorteioData} às 18h, ao vivo no Instagram da ${uniNome}. Participe: ${link}`
}

/** Chave do mês corrente no formato 'YYYY-MM'. */
export function mesRef(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Rótulo do mês corrente, ex.: 'Junho/2026'. */
export function mesLabel(d: Date = new Date()): string {
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${meses[d.getMonth()]}/${d.getFullYear()}`
}

/** Data do sorteio: dia 1 do mês seguinte, dd/mm/aaaa (legado: sorteio no dia 1 do mês seguinte). */
export function sorteioData(d: Date = new Date()): string {
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return next.toLocaleDateString('pt-BR')
}
