import Link from 'next/link'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type CargoRow = {
  id: string
  nome: string
  slug: string
  descricao: string | null
  is_sistema: boolean
  ativo: boolean
}

/** Lista de cargos (perfis de acesso) + nº de permissões e nº de usuários por cargo.
 *  RBAC vive em tabelas service-role (igual resolveRecursos de lib/session) → adminClient. */
export default async function PerfisPage() {
  const ctx = await getSessionContext()
  const isAdmin = ehAdmin(ctx?.papel)
  const admin = adminClient()

  const { data: cargosRaw } = await admin
    .from('cargos')
    .select('id, nome, slug, descricao, is_sistema, ativo')
    .order('is_sistema', { ascending: false })
    .order('nome', { ascending: true })
  const cargos = (cargosRaw ?? []) as CargoRow[]

  // Contagens agregadas (1 leitura cada) — montamos os mapas em memória.
  const [{ data: cpRaw }, { data: ucRaw }] = await Promise.all([
    admin.from('cargo_permissoes').select('cargo_id'),
    admin.from('usuario_cargos').select('cargo_id, ativo'),
  ])
  const permPorCargo = new Map<string, number>()
  for (const r of (cpRaw ?? []) as { cargo_id: string }[]) {
    permPorCargo.set(r.cargo_id, (permPorCargo.get(r.cargo_id) ?? 0) + 1)
  }
  const usuariosPorCargo = new Map<string, number>()
  for (const r of (ucRaw ?? []) as { cargo_id: string; ativo: boolean }[]) {
    if (r.ativo !== false) usuariosPorCargo.set(r.cargo_id, (usuariosPorCargo.get(r.cargo_id) ?? 0) + 1)
  }

  const sistema = cargos.filter((c) => c.is_sistema)
  const empresa = cargos.filter((c) => !c.is_sistema)
  const totalUsuariosVinc = [...usuariosPorCargo.values()].reduce((a, b) => a + b, 0)

  return (
    <div className="view active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-shield-lock" style={{ color: 'var(--brand-500)' }} /> Perfis de acesso
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
            Cada cargo concede permissões por <b>recurso × ação × escopo</b>. Abra um cargo para editar a matriz.
          </p>
        </div>
        {!isAdmin && (
          <span className="os-st os-cancelada" style={{ alignSelf: 'center' }}>
            <i className="ti ti-eye" /> Somente leitura
          </span>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Cargos cadastrados', cargos.length, 'ti-id-badge-2'],
          ['Cargos do sistema', sistema.length, 'ti-lock'],
          ['Cargos da empresa', empresa.length, 'ti-building'],
          ['Vínculos de usuário', totalUsuariosVinc, 'ti-users'],
        ] as [string, number, string][]).map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 20 }}>{val.toLocaleString('pt-BR')}</b>
            </span>
          </div>
        ))}
      </div>

      <Secao titulo="Cargos do sistema" sub="Pré-definidos (RBAC base). Editáveis, exceto Super Admin." icon="ti-lock"
        cargos={sistema} permPorCargo={permPorCargo} usuariosPorCargo={usuariosPorCargo} isAdmin={isAdmin} />
      <Secao titulo="Cargos da empresa" sub="Criados/importados por empresa (ex.: BEMP)." icon="ti-building"
        cargos={empresa} permPorCargo={permPorCargo} usuariosPorCargo={usuariosPorCargo} isAdmin={isAdmin} />
    </div>
  )
}

function Secao({
  titulo, sub, icon, cargos, permPorCargo, usuariosPorCargo, isAdmin,
}: {
  titulo: string; sub: string; icon: string
  cargos: CargoRow[]
  permPorCargo: Map<string, number>
  usuariosPorCargo: Map<string, number>
  isAdmin: boolean
}) {
  if (cargos.length === 0) return null
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <i className={`ti ${icon}`} style={{ color: 'var(--brand-500)' }} /> {titulo}
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>({cargos.length})</span>
      </h3>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>{sub}</p>
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Cargo</th>
                <th>Descrição</th>
                <th className="num-r">Permissões</th>
                <th className="num-r">Usuários</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargos.map((c) => {
                const nPerm = permPorCargo.get(c.id) ?? 0
                const nUsr = usuariosPorCargo.get(c.id) ?? 0
                const protegido = c.slug === 'super_admin'
                return (
                  <tr key={c.id} style={{ opacity: c.ativo === false ? 0.55 : 1 }}>
                    <td>
                      <span className="cli-name" style={{ fontWeight: 600 }}>
                        {protegido && <i className="ti ti-lock" style={{ color: 'var(--brand-500)', marginRight: 6, verticalAlign: '-2px' }} title="Protegido" />}
                        {c.nome}
                      </span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{c.slug}</span>
                    </td>
                    <td style={{ maxWidth: 360, fontSize: 12.5, color: 'var(--text-2)' }}>{c.descricao || <span className="muted">—</span>}</td>
                    <td className="num-r"><b>{nPerm.toLocaleString('pt-BR')}</b></td>
                    <td className="num-r">
                      <span title={`${nUsr} usuário(s) com este cargo`} style={{ fontWeight: nUsr ? 600 : 400, color: nUsr ? 'var(--text)' : 'var(--text-3)' }}>
                        {nUsr.toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td>
                      {c.ativo === false
                        ? <span className="os-st os-cancelada">Inativo</span>
                        : <span className="os-st os-fechada">Ativo</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <Link className="btn" href={`/perfis/${c.id}`}>
                        <i className={`ti ${isAdmin && !protegido ? 'ti-edit' : 'ti-eye'}`} /> {isAdmin && !protegido ? 'Editar' : 'Ver'}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
