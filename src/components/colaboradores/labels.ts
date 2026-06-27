// Enums e labels REAIS de colaboradores (lkii). Arquivo client-safe (sem 'use server'),
// importado tanto pela UI quanto pelas Server Actions (que só podem exportar async).
//
// Valores de cargo confirmados via probe de insert: gerente, subgerente,
// consultora_vendas, aplicadora.
// TODO(legado: cargoEnumCompleto): o enum cargo_colaborador pode ter mais labels não
// descobríveis por probe (sem acesso a pg_enum). Cargo vindo do banco fora desta lista
// ainda é aceito na edição (a UI mantém o valor atual).
export const CARGOS = ['gerente', 'subgerente', 'consultora_vendas', 'aplicadora'] as const
export const REGIMES = ['clt', 'pj'] as const // enum regime_trabalho
export const TIPOS = ['loja', 'backoffice'] as const // enum tipo_colaborador
export const STATUS = ['ativo', 'inativo'] as const // enum status

export type Cargo = (typeof CARGOS)[number]
export type Regime = (typeof REGIMES)[number]
export type Tipo = (typeof TIPOS)[number]

// Cargos confirmados por probe (aceitos no insert do enum cargo_colaborador).
export const CARGO_LABELS: Record<string, string> = {
  gerente: 'Gerente',
  subgerente: 'Subgerente',
  consultora_vendas: 'Consultora de Vendas',
  aplicadora: 'Aplicadora',
}

// Perfis de acesso do legado (view-colaboradores filtros ~2085). Inclui os perfis
// que não são cargos do enum (Profissional/SAC/Proprietário). Usado SÓ para exibir
// rótulo e para o filtro "Perfil de acesso" da lista — NÃO é validado no insert
// (o enum cargo_colaborador só aceita os 4 de CARGO_LABELS). Cargo vindo do banco
// fora do enum continua sendo exibido por aqui.
export const PERFIL_LABELS: Record<string, string> = {
  ...CARGO_LABELS,
  profissional: 'Profissional',
  sac: 'SAC',
  proprietario: 'Proprietário',
}

// Mapeia o cargo do enum → perfil de acesso amigável do legado, quando difere.
export const perfilLabel = (c: string | null | undefined) => (c ? PERFIL_LABELS[c] ?? c : '—')

export const REGIME_LABELS: Record<string, string> = {
  clt: 'CLT',
  pj: 'PJ',
}

export const TIPO_LABELS: Record<string, string> = {
  loja: 'Loja',
  backoffice: 'Backoffice',
}

export const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
}

export const cargoLabel = (c: string | null | undefined) => (c ? CARGO_LABELS[c] ?? c : '—')
export const regimeLabel = (r: string | null | undefined) => (r ? REGIME_LABELS[r] ?? r : '—')
export const tipoLabel = (t: string | null | undefined) => (t ? TIPO_LABELS[t] ?? t : '—')
