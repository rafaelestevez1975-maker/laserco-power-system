import Link from 'next/link'
import { getSessionContext } from '@/lib/session'
import { adminClient } from '@/lib/supabase/admin'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'

export const dynamic = 'force-dynamic'

// Relatório read-only de RBAC: quem tem qual perfil de acesso.
// Fonte (confirmada no código  src/app/(app)/perfis/*):
//   cargos            → id, nome, slug, descricao, is_sistema, ativo
//   usuario_cargos    → perfil_id, cargo_id, unidade_id, ativo, expira_em
//   cargo_permissoes  → cargo_id, permissao_id
//   perfis_usuario    → id, nome_completo, email
// Essas tabelas vivem sob service-role (igual lib/session.resolveRecursos e /perfis) → adminClient.

type CargoRow = { id: string; nome: string; slug: string; descricao: string | null; is_sistema: boolean; ativo: boolean }
type UsuarioCargoRow = { perfil_id: string; cargo_id: string; unidade_id: string | null; ativo: boolean }
type CargoPermRow = { cargo_id: string }
type PerfilUsuarioRow = { id: string; nome_completo: string | null; email: string | null }

type LinhaUsuario = {
  perfilId: string
  cargoId: string
  nome: string
  email: string | null
  perfil: string
  unidade: string
  ativo: boolean
}

export default async function RelPerfisAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ uni?: string }>
}) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const admin = adminClient()

  const unidadeId = ctx?.activeUnitId ?? null
  const nomeUnidade: Record<string, string> = Object.fromEntries((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))

  // ── Leituras RBAC (paralelo). Toda query trata erro → estado vazio (não quebra runtime). ──
  const [cargosRes, ucRes, cpRes, puRes] = await Promise.all([
    admin.from('cargos').select('id, nome, slug, descricao, is_sistema, ativo')
      .order('is_sistema', { ascending: false })
      .order('nome', { ascending: true }),
    admin.from('usuario_cargos').select('perfil_id, cargo_id, unidade_id, ativo'),
    admin.from('cargo_permissoes').select('cargo_id'),
    admin.from('perfis_usuario').select('id, nome_completo, email').limit(2000),
  ])

  const cargos = (cargosRes.error ? [] : (cargosRes.data ?? [])) as CargoRow[]
  const vinculos = (ucRes.error ? [] : (ucRes.data ?? [])) as UsuarioCargoRow[]
  const cargoPerms = (cpRes.error ? [] : (cpRes.data ?? [])) as CargoPermRow[]
  const usuarios = (puRes.error ? [] : (puRes.data ?? [])) as PerfilUsuarioRow[]

  // Se nem a tabela base de perfis respondeu, mostra "sem fonte de dados ainda".
  const semFonte = cargosRes.error != null && cargos.length === 0

  // ── Mapas de apoio ──
  const usuarioMap = new Map(usuarios.map((u) => [u.id, u]))
  const cargoMap = new Map(cargos.map((c) => [c.id, c]))

  // Permissões por cargo.
  const permPorCargo: Record<string, number> = {}
  for (const r of cargoPerms) permPorCargo[r.cargo_id] = (permPorCargo[r.cargo_id] ?? 0) + 1

  // Usuários ativos por cargo (contagem global, sem filtro de unidade  visão do perfil).
  const usuariosAtivosPorCargo: Record<string, number> = {}
  for (const v of vinculos) {
    if (v.ativo !== false) usuariosAtivosPorCargo[v.cargo_id] = (usuariosAtivosPorCargo[v.cargo_id] ?? 0) + 1
  }

  // ── Linhas "usuário → perfil" (escopadas por unidade ativa quando houver). ──
  // usuario_cargos.unidade_id pode ser null (vínculo global / todas as unidades): sempre incluímos esses.
  const linhasUsuario: LinhaUsuario[] = vinculos
    .filter((v) => !unidadeId || v.unidade_id == null || v.unidade_id === unidadeId)
    .map((v) => {
      const u = usuarioMap.get(v.perfil_id)
      const c = cargoMap.get(v.cargo_id)
      return {
        perfilId: v.perfil_id,
        cargoId: v.cargo_id,
        nome: u?.nome_completo || u?.email || v.perfil_id,
        email: u?.email ?? null,
        perfil: c?.nome ?? '',
        unidade: v.unidade_id == null ? 'Todas as unidades' : (nomeUnidade[v.unidade_id] ?? 'Unidade ' + v.unidade_id.slice(0, 6)),
        ativo: v.ativo !== false,
      }
    })
    .sort((a, b) => a.perfil.localeCompare(b.perfil) || a.nome.localeCompare(b.nome))

  // ── KPIs ──
  const perfisCadastrados = cargos.length
  const perfisAtivos = cargos.filter((c) => c.ativo !== false).length
  const perfisInativos = perfisCadastrados - perfisAtivos
  const perfisSistema = cargos.filter((c) => c.is_sistema).length
  const usuariosComPerfilAtivo = linhasUsuario.filter((l) => l.ativo).length

  const kpis: RelKpi[] = [
    { label: 'Perfis cadastrados', value: perfisCadastrados.toLocaleString('pt-BR'), icon: 'ti-shield-lock' },
    { label: 'Usuários com perfil', value: usuariosComPerfilAtivo.toLocaleString('pt-BR'), icon: 'ti-user-check' },
    { label: 'Perfis de sistema', value: perfisSistema.toLocaleString('pt-BR'), icon: 'ti-settings' },
    {
      label: 'Perfis inativos',
      value: perfisInativos.toLocaleString('pt-BR'),
      icon: 'ti-user-off',
      ...(perfisInativos > 0 ? { delta: `${perfisInativos} desativado(s)`, deltaTone: 'down' as const } : {}),
    },
  ]

  // ── Resumo por perfil (todos os cargos, com nº de usuários ativos no escopo da unidade) ──
  const usuariosAtivosNoEscopoPorCargo: Record<string, number> = {}
  for (const l of linhasUsuario) {
    if (l.ativo) usuariosAtivosNoEscopoPorCargo[l.cargoId] = (usuariosAtivosNoEscopoPorCargo[l.cargoId] ?? 0) + 1
  }
  const resumoPerfis = cargos
    .map((c) => ({
      ...c,
      permissoes: permPorCargo[c.id] ?? 0,
      usuariosTotal: usuariosAtivosPorCargo[c.id] ?? 0,
      usuariosEscopo: usuariosAtivosNoEscopoPorCargo[c.id] ?? 0,
    }))
    .sort((a, b) => b.usuariosTotal - a.usuariosTotal || a.nome.localeCompare(b.nome))

  const barUsuariosPorPerfil: BarRow[] = resumoPerfis
    .filter((p) => p.usuariosTotal > 0)
    .slice(0, 10)
    .map((p) => ({ label: p.nome, value: p.usuariosTotal, display: p.usuariosTotal.toLocaleString('pt-BR') }))

  const barPermissoesPorPerfil: BarRow[] = resumoPerfis
    .filter((p) => p.permissoes > 0)
    .slice(0, 10)
    .map((p) => ({ label: p.nome, value: p.permissoes, display: p.permissoes.toLocaleString('pt-BR') }))

  // Estado "sem fonte de dados ainda": RBAC não respondeu / não existe.
  if (semFonte) {
    return (
      <div className="view active">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Relatório de Perfis de acesso</h2>
        </div>
        <div className="crm-note" style={{ marginTop: 12 }}>
          <i className="ti ti-database-off" /> Relatório em preparação  sem fonte de dados ainda. As tabelas de
          perfis de acesso (RBAC) não retornaram dados no momento.
        </div>
      </div>
    )
  }

  return (
    <div className="view active">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 10px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Relatório de Perfis de acesso</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          RBAC · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
        <Link
          href="/cadastros/perfis"
          className="btn btn-ghost"
          style={{ fontSize: 12.5, marginLeft: 'auto', textDecoration: 'none' }}
        >
          <i className="ti ti-settings" /> Gerenciar perfis
        </Link>
      </div>

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Usuários por perfil" icon="ti-users" rows={barUsuariosPorPerfil} emptyMsg="Nenhum usuário vinculado a perfis." />
        <BarChart title="Permissões por perfil" icon="ti-key" rows={barPermissoesPorPerfil} gold emptyMsg="Nenhuma permissão concedida." />
      </div>

      {/* ── Resumo por perfil ── */}
      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-shield-lock" /> Perfis cadastrados
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{resumoPerfis.length} perfil(is)</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Origem</th>
                <th className="num-r">Permissões</th>
                <th className="num-r">Usuários ativos</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {resumoPerfis.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhum perfil de acesso cadastrado.
                  </td>
                </tr>
              )}
              {resumoPerfis.map((p) => (
                <tr key={p.id} style={{ opacity: p.ativo === false ? 0.6 : 1 }}>
                  <td className="cli-name" style={{ fontWeight: 600 }}>
                    {p.nome}
                    {p.slug && <span className="muted" style={{ fontFamily: 'monospace', fontSize: 11.5, marginLeft: 6 }}>{p.slug}</span>}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                    {p.is_sistema ? 'Sistema' : 'Empresa'}
                  </td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{p.permissoes.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>
                    {unidadeId ? p.usuariosEscopo.toLocaleString('pt-BR') : p.usuariosTotal.toLocaleString('pt-BR')}
                  </td>
                  <td>
                    {p.ativo === false
                      ? <span className="os-st os-cancelada">Inativo</span>
                      : <span className="os-st os-fechada">Ativo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Usuários e seus perfis ── */}
      <div className="rel-card" style={{ marginTop: 16 }}>
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-users" /> Usuários e seus perfis
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{linhasUsuario.length} vínculo(s)</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Unidade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {linhasUsuario.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    {unidadeId
                      ? 'Nenhum usuário com perfil de acesso nesta unidade.'
                      : 'Nenhum usuário vinculado a perfis de acesso.'}
                  </td>
                </tr>
              )}
              {linhasUsuario.map((l) => (
                <tr key={`${l.perfilId}-${l.cargoId}-${l.unidade}`} style={{ opacity: l.ativo ? 1 : 0.55 }}>
                  <td className="cli-name" style={{ fontWeight: 600 }}>{l.nome}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{l.email || <span className="muted"></span>}</td>
                  <td>{l.perfil}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{l.unidade}</td>
                  <td>
                    {l.ativo
                      ? <span className="os-st os-fechada">Ativo</span>
                      : <span className="os-st os-cancelada">Inativo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="crm-note" style={{ marginTop: 16, fontSize: 12.5 }}>
        <i className="ti ti-info-circle" /> Visão somente leitura do RBAC. Para criar perfis, ajustar permissões ou
        atribuir usuários, use <Link href="/cadastros/perfis" style={{ fontWeight: 600 }}>Cadastros → Perfis de acesso</Link>.
        {unidadeId
          ? ' Os vínculos exibidos incluem os globais (todas as unidades) e os desta unidade.'
          : ''}
      </div>
    </div>
  )
}
