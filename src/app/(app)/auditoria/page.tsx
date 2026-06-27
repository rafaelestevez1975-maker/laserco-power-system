import { getSessionContext } from '@/lib/session'
import { adminClient } from '@/lib/supabase/admin'
import { AuditoriaFiltros } from '@/components/auditoria/AuditoriaFiltros'
import { AuditoriaTabela, type AuditRow } from '@/components/auditoria/AuditoriaTabela'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

type SP = {
  q?: string // busca em acao/recurso_label
  acao?: string // filtro por ação exata
  usuario?: string // perfis_usuario.id
  resultado?: string // sucesso | erro
  di?: string // criado_em >= (YYYY-MM-DD)
  df?: string // criado_em <= (YYYY-MM-DD)
  page?: string
}

/**
 * /auditoria — visualizador read-only do audit_log. Somente admin_geral lê.
 * Usa service-role (adminClient) APENAS para leitura agregada/RBAC: o audit_log
 * é log de sistema e fica fora da RLS de negócio. Nenhuma escrita ocorre aqui.
 */
export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()

  // RBAC: auditoria é só para admin.
  if (!ctx?.isAdmin) {
    return (
      <div className="view active">
        <div className="perm-card" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
          <i className="ti ti-lock" style={{ fontSize: 30, color: 'var(--text-3)' }} />
          <h3 style={{ margin: '12px 0 6px' }}>Acesso restrito</h3>
          <p style={{ color: 'var(--text-2)', fontSize: 13 }}>
            A trilha de auditoria está disponível apenas para administradores gerais.
          </p>
        </div>
      </div>
    )
  }

  const admin = adminClient()
  const page = Math.max(1, Number(sp.page) || 1)
  const from = (page - 1) * PAGE_SIZE

  // Aplica filtros comuns numa query do audit_log.
  function aplicar<
    Q extends {
      eq(c: string, v: unknown): Q
      gte(c: string, v: unknown): Q
      lte(c: string, v: unknown): Q
      or(f: string): Q
    },
  >(q: Q): Q {
    let out = q
    if (sp.acao) out = out.eq('acao', sp.acao)
    if (sp.usuario) out = out.eq('usuario_id', sp.usuario)
    if (sp.resultado === 'sucesso' || sp.resultado === 'erro') out = out.eq('resultado', sp.resultado)
    if (sp.di) out = out.gte('criado_em', sp.di + 'T00:00:00')
    if (sp.df) out = out.lte('criado_em', sp.df + 'T23:59:59')
    if (sp.q) {
      const t = sp.q.replace(/[,()*]/g, ' ').trim()
      if (t) out = out.or(`acao.ilike.%${t}%,recurso_label.ilike.%${t}%,recurso_id.ilike.%${t}%`)
    }
    return out
  }

  // ── Página de eventos ──
  let listQ = admin
    .from('audit_log')
    .select('id, usuario_id, acao, recurso_id, recurso_label, resultado, origem, ip, mensagem_erro, dados_depois, criado_em', { count: 'exact' })
    .order('criado_em', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  listQ = aplicar(listQ)
  const { data: rowsRaw, count } = await listQ
  const rowsBase = (rowsRaw ?? []) as Omit<AuditRow, 'usuarioNome'>[]

  // Resolve nomes de usuário (audit_log.usuario_id → perfis_usuario.nome_completo).
  const userIds = [...new Set(rowsBase.map((r) => r.usuario_id).filter(Boolean) as string[])]
  const nomePorId: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: perfis } = await admin.from('perfis_usuario').select('id, nome_completo').in('id', userIds)
    for (const p of (perfis ?? []) as { id: string; nome_completo: string | null }[]) {
      nomePorId[p.id] = p.nome_completo || '—'
    }
  }
  const rows: AuditRow[] = rowsBase.map((r) => ({
    ...r,
    usuarioNome: r.usuario_id ? nomePorId[r.usuario_id] ?? 'Usuário removido' : 'Sistema',
  }))

  // ── Opções para os selects de filtro (ações distintas + usuários que aparecem) ──
  const { data: acoesRaw } = await admin.from('audit_log').select('acao').order('acao', { ascending: true }).limit(1000)
  const acoes = [...new Set(((acoesRaw ?? []) as { acao: string | null }[]).map((a) => a.acao).filter(Boolean) as string[])]

  const { data: usuariosOpcRaw } = await admin
    .from('perfis_usuario')
    .select('id, nome_completo')
    .order('nome_completo', { ascending: true })
    .limit(500)
  const usuarios = ((usuariosOpcRaw ?? []) as { id: string; nome_completo: string | null }[])
    .map((u) => ({ id: u.id, nome: u.nome_completo || '—' }))

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(sp.q || sp.acao || sp.usuario || sp.resultado || sp.di || sp.df)

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-history" /> Trilha de auditoria — registro imutável de ações do sistema
        (somente leitura).
      </div>

      <AuditoriaFiltros
        acoes={acoes}
        usuarios={usuarios}
        valores={{ q: sp.q ?? '', acao: sp.acao ?? '', usuario: sp.usuario ?? '', resultado: sp.resultado ?? '', di: sp.di ?? '', df: sp.df ?? '' }}
      />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-list" /> {total} evento(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages}
      </div>

      <AuditoriaTabela rows={rows} page={page} totalPages={totalPages} total={total} searchParams={sp} />
    </div>
  )
}
