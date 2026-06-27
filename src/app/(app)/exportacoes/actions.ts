'use server'

import { requireOperador, msgErro } from '@/lib/sb'
import { getSessionContext } from '@/lib/session'
import { siteClient } from '@/lib/supabase/site'
import { EXPORT_LIMIT } from '@/lib/exportacoes'

/** Resultado padrão das ações de leitura: ok + linhas OU erro. */
export type ExportResult = { ok: true; rows: Record<string, string>[]; cols: string[]; truncado: boolean } | { ok: false; error: string }

/** Datasets exportáveis (chave usada pelo hub e pelo client). */
export type DatasetKey = 'clientes' | 'contas' | 'leads' | 'agendamentos' | 'colaboradores' | 'chamados'

const pick = <T,>(e: T | T[] | null | undefined): T | null => (Array.isArray(e) ? (e[0] ?? null) : (e ?? null))

/** "31/12/2026" a partir de ISO/data (sem dependência de TZ do servidor). */
function dBR(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('pt-BR')
}
/** "31/12/2026 14:05" para campos com hora. */
function dhBR(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
/** Número com 2 casas no padrão BR (para colunas de valor). */
function numBR(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const simNao = (b: boolean | null | undefined) => (b ? 'Sim' : 'Não')

// ──────────────────────────── Clientes ────────────────────────────

export async function exportClientes(): Promise<ExportResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error || 'Sessão expirada.' }
  const ctx = await getSessionContext()
  const activeUnit = ctx?.activeUnitId ?? null

  let q = op.sb
    .from('clientes')
    .select('nome, telefone, cpf, email, genero, cidade, estado, saldo_pontos, saldo_creditos, ativo, verificado, criado_em')
    .order('nome', { ascending: true })
    .limit(EXPORT_LIMIT + 1)
  if (activeUnit) q = q.eq('unidade_origem_id', activeUnit)

  const { data, error: e } = await q
  if (e) return { ok: false, error: msgErro(e.message, 'exportar clientes') }
  const raw = (data ?? []) as Array<{
    nome: string | null; telefone: string | null; cpf: string | null; email: string | null; genero: string | null
    cidade: string | null; estado: string | null; saldo_pontos: number | null; saldo_creditos: number | null
    ativo: boolean | null; verificado: boolean | null; criado_em: string | null
  }>
  const truncado = raw.length > EXPORT_LIMIT
  const generoLbl = (g: string | null) => (g === 'female' ? 'Feminino' : g === 'male' ? 'Masculino' : g === 'other' ? 'Outro' : '')
  const cols = ['Nome', 'Telefone', 'CPF', 'E-mail', 'Gênero', 'Cidade', 'Estado', 'Pontos', 'Créditos', 'Ativo', 'Verificado', 'Cadastro']
  const rows = raw.slice(0, EXPORT_LIMIT).map((r) => ({
    Nome: r.nome ?? '', Telefone: r.telefone ?? '', CPF: r.cpf ?? '', 'E-mail': r.email ?? '',
    'Gênero': generoLbl(r.genero), Cidade: r.cidade ?? '', Estado: r.estado ?? '',
    Pontos: String(r.saldo_pontos ?? 0), 'Créditos': numBR(r.saldo_creditos),
    Ativo: simNao(r.ativo), Verificado: simNao(r.verificado), Cadastro: dBR(r.criado_em),
  }))
  return { ok: true, rows, cols, truncado }
}

// ───────────────── Contas a pagar/receber (lancamentos_financeiros) ─────────────────

export async function exportContas(): Promise<ExportResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error || 'Sessão expirada.' }
  const ctx = await getSessionContext()
  const activeUnit = ctx?.activeUnitId ?? null

  // Nomes de categoria/unidade para enriquecer (best-effort).
  const [{ data: catRaw }, uniRaw] = await Promise.all([
    op.sb.from('plano_contas').select('id, nome'),
    Promise.resolve(ctx?.unidades ?? []),
  ])
  const catNome: Record<string, string> = Object.fromEntries(((catRaw ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]))
  const uniNome: Record<string, string> = Object.fromEntries(uniRaw.map((u) => [u.id, u.nome]))

  let q = op.sb
    .from('lancamentos_financeiros')
    .select('tipo, descricao, valor, status, data_vencimento, data_pagamento, categoria_id, unidade_id, forma_pagamento, fornecedor, observacao')
    .order('data_vencimento', { ascending: false, nullsFirst: false })
    .limit(EXPORT_LIMIT + 1)
  if (activeUnit) q = q.eq('unidade_id', activeUnit)

  const { data, error: e } = await q
  if (e) return { ok: false, error: msgErro(e.message, 'exportar contas') }
  const raw = (data ?? []) as Array<{
    tipo: string | null; descricao: string | null; valor: number | null; status: string | null
    data_vencimento: string | null; data_pagamento: string | null; categoria_id: string | null; unidade_id: string | null
    forma_pagamento: string | null; fornecedor: string | null; observacao: string | null
  }>
  const truncado = raw.length > EXPORT_LIMIT
  const tipoLbl = (t: string | null) => (t === 'receita' ? 'A receber' : t === 'despesa' ? 'A pagar' : '')
  const cols = ['Tipo', 'Descrição', 'Fornecedor', 'Categoria', 'Unidade', 'Vencimento', 'Pagamento', 'Valor', 'Status', 'Forma', 'Observação']
  const rows = raw.slice(0, EXPORT_LIMIT).map((r) => ({
    Tipo: tipoLbl(r.tipo), 'Descrição': r.descricao ?? '', Fornecedor: r.fornecedor ?? '',
    Categoria: r.categoria_id ? (catNome[r.categoria_id] ?? '') : '',
    Unidade: r.unidade_id ? (uniNome[r.unidade_id] ?? 'Loja') : 'Franqueadora / rede',
    Vencimento: dBR(r.data_vencimento), Pagamento: dBR(r.data_pagamento), Valor: numBR(r.valor),
    Status: r.status ?? '', Forma: r.forma_pagamento ?? '', 'Observação': r.observacao ?? '',
  }))
  return { ok: true, rows, cols, truncado }
}

// ──────────────────────────── Leads do site ────────────────────────────

export async function exportLeads(): Promise<ExportResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error || 'Sessão expirada.' }

  const cols = ['Tipo', 'Nome', 'Contato', 'E-mail', 'Área/Unidade', 'Mensagem', 'Origem', 'Roteado', 'Quando']
  const site = siteClient()

  if (site) {
    // Fonte REAL: lasercompany_leads (Supabase do site). Sem escopo por unidade (origem externa).
    const { data, error: e } = await site.from('lasercompany_leads')
      .select('id, tipo, nome, telefone, email, unidade, created_at, dados')
      .order('created_at', { ascending: false })
      .limit(EXPORT_LIMIT + 1)
    if (e) return { ok: false, error: msgErro(e.message, 'exportar leads do site') }
    const raw = (data ?? []) as Array<{ tipo?: string; nome?: string; telefone?: string; email?: string; unidade?: string; created_at?: string
      dados?: { nome?: string; telefone?: string; whatsapp?: string; email?: string; mensagem?: string; area?: string; origem?: string; _roteado?: boolean } }>
    const truncado = raw.length > EXPORT_LIMIT
    const rows = raw.slice(0, EXPORT_LIMIT).map((r) => ({
      Tipo: r.tipo ?? '', Nome: r.nome || r.dados?.nome || '',
      Contato: r.telefone || r.dados?.telefone || r.dados?.whatsapp || '',
      'E-mail': r.email || r.dados?.email || '',
      'Área/Unidade': r.dados?.area || r.unidade || '',
      Mensagem: r.dados?.mensagem || '', Origem: r.dados?.origem || r.unidade || '',
      Roteado: simNao(r.dados?._roteado === true), Quando: dhBR(r.created_at),
    }))
    return { ok: true, rows, cols, truncado }
  }

  // Fallback: lkii.site_leads (enquanto não há a service key do site).
  const { data, error: e } = await op.sb.from('site_leads').select('id, data, created_at').order('created_at', { ascending: false }).limit(EXPORT_LIMIT + 1)
  if (e) return { ok: false, error: msgErro(e.message, 'exportar leads do site') }
  const raw = (data ?? []) as Array<{ created_at: string | null; data: { tipo?: string; origem?: string; status?: string
    dados?: { nome?: string; email?: string; whatsapp?: string; telefone?: string; mensagem?: string; area?: string } } | null }>
  const truncado = raw.length > EXPORT_LIMIT
  const rows = raw.slice(0, EXPORT_LIMIT).map((r) => {
    const d = r.data?.dados ?? {}
    return {
      Tipo: r.data?.tipo ?? '', Nome: d.nome?.trim() || '',
      Contato: d.whatsapp || d.telefone || '', 'E-mail': d.email || '',
      'Área/Unidade': d.area || '', Mensagem: d.mensagem || '', Origem: r.data?.origem || '',
      Roteado: simNao(r.data?.status === 'roteado'), Quando: dhBR(r.created_at),
    }
  })
  return { ok: true, rows, cols, truncado }
}

// ──────────────────────────── Agendamentos ────────────────────────────

export async function exportAgendamentos(): Promise<ExportResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error || 'Sessão expirada.' }
  const ctx = await getSessionContext()
  const activeUnit = ctx?.activeUnitId ?? null

  let q = op.sb
    .from('agendamentos')
    .select('inicio, fim, status, observacao, cliente:clientes(nome), servico:servicos(nome), profissional:perfis_usuario!agendamentos_profissional_id_fkey(nome_completo)')
    .order('inicio', { ascending: false })
    .limit(EXPORT_LIMIT + 1)
  if (activeUnit) q = q.eq('unidade_id', activeUnit)

  const { data, error: e } = await q
  if (e) return { ok: false, error: msgErro(e.message, 'exportar agendamentos') }
  type Row = {
    inicio: string | null; fim: string | null; status: string | null; observacao: string | null
    cliente: { nome: string | null } | { nome: string | null }[] | null
    servico: { nome: string | null } | { nome: string | null }[] | null
    profissional: { nome_completo: string | null } | { nome_completo: string | null }[] | null
  }
  const raw = (data ?? []) as Row[]
  const truncado = raw.length > EXPORT_LIMIT
  const cols = ['Início', 'Fim', 'Cliente', 'Serviço', 'Profissional', 'Status', 'Observação']
  const rows = raw.slice(0, EXPORT_LIMIT).map((r) => ({
    'Início': dhBR(r.inicio), Fim: dhBR(r.fim),
    Cliente: pick(r.cliente)?.nome ?? '', 'Serviço': pick(r.servico)?.nome ?? '',
    Profissional: pick(r.profissional)?.nome_completo ?? '', Status: r.status ?? '', 'Observação': r.observacao ?? '',
  }))
  return { ok: true, rows, cols, truncado }
}

// ──────────────────────────── Colaboradores ────────────────────────────

export async function exportColaboradores(): Promise<ExportResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error || 'Sessão expirada.' }
  const ctx = await getSessionContext()
  const activeUnit = ctx?.activeUnitId ?? null

  // Colunas extras (exibe_agenda/ultimo_acesso) podem não existir → degrade p/ base.
  const COLS_FULL = 'nome, cpf, telefone, email, cargo, area, departamento, regime, tipo, status, data_admissao'
  let q = op.sb
    .from('colaboradores')
    .select(COLS_FULL)
    .order('nome', { ascending: true })
    .limit(EXPORT_LIMIT + 1)
  if (activeUnit) q = q.eq('unidade_id', activeUnit)

  const { data, error: e } = await q
  if (e) return { ok: false, error: msgErro(e.message, 'exportar colaboradores') }
  const raw = (data ?? []) as Array<{
    nome: string | null; cpf: string | null; telefone: string | null; email: string | null
    cargo: string | null; area: string | null; departamento: string | null; regime: string | null
    tipo: string | null; status: string | null; data_admissao: string | null
  }>
  const truncado = raw.length > EXPORT_LIMIT
  const cols = ['Nome', 'CPF', 'Telefone', 'E-mail', 'Cargo', 'Área', 'Departamento', 'Regime', 'Tipo', 'Status', 'Admissão']
  const rows = raw.slice(0, EXPORT_LIMIT).map((r) => ({
    Nome: r.nome ?? '', CPF: r.cpf ?? '', Telefone: r.telefone ?? '', 'E-mail': r.email ?? '',
    Cargo: r.cargo ?? '', 'Área': r.area ?? '', Departamento: r.departamento ?? '',
    Regime: (r.regime ?? '').toUpperCase(), Tipo: r.tipo ?? '', Status: r.status ?? '', 'Admissão': dBR(r.data_admissao),
  }))
  return { ok: true, rows, cols, truncado }
}

// ──────────────────────────── Chamados SAC ────────────────────────────

export async function exportChamados(): Promise<ExportResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error || 'Sessão expirada.' }
  const ctx = await getSessionContext()
  const activeUnit = ctx?.activeUnitId ?? null
  const uniNome: Record<string, string> = Object.fromEntries((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))

  let q = op.sb
    .from('sac_tickets')
    .select('numero, protocolo, nome_cliente, telefone_cliente, email_cliente, cpf_cliente, canal, unidade_id, motivo_label, prioridade, fase, sla_violado, criado_em')
    .order('criado_em', { ascending: false })
    .limit(EXPORT_LIMIT + 1)
  if (activeUnit) q = q.eq('unidade_id', activeUnit)

  const { data, error: e } = await q
  if (e) return { ok: false, error: msgErro(e.message, 'exportar chamados') }
  const raw = (data ?? []) as Array<{
    numero: number | null; protocolo: string | null; nome_cliente: string | null; telefone_cliente: string | null
    email_cliente: string | null; cpf_cliente: string | null; canal: string | null; unidade_id: string | null
    motivo_label: string | null; prioridade: string | null; fase: string | null; sla_violado: boolean | null; criado_em: string | null
  }>
  const truncado = raw.length > EXPORT_LIMIT
  const cols = ['Protocolo', 'Cliente', 'Telefone', 'E-mail', 'CPF', 'Canal', 'Unidade', 'Motivo', 'Prioridade', 'Fase', 'SLA', 'Abertura']
  const rows = raw.slice(0, EXPORT_LIMIT).map((r) => ({
    Protocolo: r.protocolo || (r.numero != null ? `SAC-${r.numero}` : ''),
    Cliente: r.nome_cliente ?? '', Telefone: r.telefone_cliente ?? '', 'E-mail': r.email_cliente ?? '', CPF: r.cpf_cliente ?? '',
    Canal: r.canal ?? '', Unidade: r.unidade_id ? (uniNome[r.unidade_id] ?? '') : '',
    Motivo: r.motivo_label ?? '', Prioridade: r.prioridade ?? '', Fase: r.fase ?? '',
    SLA: r.sla_violado ? 'Violado' : 'OK', Abertura: dhBR(r.criado_em),
  }))
  return { ok: true, rows, cols, truncado }
}
