import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'
import { PermissoesGrid, type Recurso, type Acao, type GridState } from '@/components/perfis/PermissoesGrid'
import { DadosPerfilCard } from '@/components/perfis/DadosPerfilCard'
import { VinculosUsuario, type UsuarioOpcao, type VinculoRow } from '@/components/perfis/VinculosUsuario'

export const dynamic = 'force-dynamic'

type CargoRow = {
  id: string
  nome: string
  slug: string
  descricao: string | null
  is_sistema: boolean
  ativo: boolean
  bate_ponto?: boolean | null
}

/** Editor da matriz recurso×ação de um cargo. Lê cargo_permissoes (estado atual) e
 *  monta o grid. O salvar (client → server action) PERSISTE de verdade. */
export default async function PerfilEditorPage({ params }: { params: Promise<{ cargoId: string }> }) {
  const { cargoId } = await params
  const ctx = await getSessionContext()
  const isAdmin = ehAdmin(ctx?.papel)
  const admin = adminClient()

  // bate_ponto pode não existir ainda (migration rbac.sql)  tolera coluna ausente.
  let cargo: CargoRow | null = null
  let temBatePonto = true
  {
    const r = await admin.from('cargos').select('id, nome, slug, descricao, is_sistema, ativo, bate_ponto').eq('id', cargoId).maybeSingle()
    if (r.error && /bate_ponto/.test(r.error.message)) {
      temBatePonto = false
      const r2 = await admin.from('cargos').select('id, nome, slug, descricao, is_sistema, ativo').eq('id', cargoId).maybeSingle()
      cargo = r2.data as CargoRow | null
    } else {
      cargo = r.data as CargoRow | null
    }
  }
  if (!cargo) notFound()

  // Recursos (linhas, agrupados por módulo) + ações (colunas).
  const [{ data: recRaw }, { data: acoesRaw }, { data: permsRaw }, { data: cpRaw }, { data: vincRaw }, { data: usuariosRaw }] = await Promise.all([
    admin.from('recursos').select('id, modulo, nome, descricao').order('modulo', { ascending: true }).order('id', { ascending: true }),
    admin.from('acoes').select('id, descricao').order('id', { ascending: true }),
    admin.from('permissoes').select('id, recurso_id, acao_id, escopo'),
    admin.from('cargo_permissoes').select('permissao_id').eq('cargo_id', cargoId),
    admin.from('usuario_cargos').select('perfil_id, unidade_id, ativo, expira_em').eq('cargo_id', cargoId),
    admin.from('perfis_usuario').select('id, nome_completo, email').order('nome_completo', { ascending: true }).limit(500),
  ])

  const recursos = (recRaw ?? []) as Recurso[]
  const acoes = (acoesRaw ?? []) as Acao[]
  const perms = (permsRaw ?? []) as { id: string; recurso_id: string; acao_id: string; escopo: string }[]
  const concedidas = new Set(((cpRaw ?? []) as { permissao_id: string }[]).map((r) => r.permissao_id))

  const usuariosTodos = (usuariosRaw ?? []) as { id: string; nome_completo: string | null; email: string | null }[]
  const usuariosMap = new Map(usuariosTodos.map((u) => [u.id, u]))
  const vinculos: VinculoRow[] = ((vincRaw ?? []) as { perfil_id: string; unidade_id: string | null; ativo: boolean; expira_em: string | null }[])
    .map((v) => {
      const u = usuariosMap.get(v.perfil_id)
      return {
        perfilId: v.perfil_id,
        nome: u?.nome_completo || u?.email || v.perfil_id,
        email: u?.email || null,
        ativo: v.ativo !== false,
        expiraEm: v.expira_em,
      }
    })
  const vinculadosSet = new Set(vinculos.map((v) => v.perfilId))
  // Opções para atribuir: usuários ainda não vinculados a este cargo.
  const opcoes: UsuarioOpcao[] = usuariosTodos
    .filter((u) => !vinculadosSet.has(u.id))
    .map((u) => ({ id: u.id, nome: u.nome_completo || u.email || u.id, email: u.email || null }))

  // permId → (recurso,acao,escopo) para reconstruir o estado do grid a partir das concedidas.
  const byId = new Map(perms.map((p) => [p.id, p]))
  // Estado inicial: célula (recurso|acao) → escopo concedido (pega o mais amplo, se houver vários).
  const ORDEM: Record<string, number> = { proprio: 1, unidade: 2, empresa: 3, global: 4 }
  const inicial: GridState = {}
  for (const pid of concedidas) {
    const p = byId.get(pid)
    if (!p) continue
    const k = `${p.recurso_id}|${p.acao_id}`
    const atual = inicial[k]
    if (!atual || (ORDEM[p.escopo] ?? 0) > (ORDEM[atual] ?? 0)) inicial[k] = p.escopo as GridState[string]
  }

  // Quais (recurso,acao) realmente existem no schema (algum escopo cadastrado) → habilita a célula.
  const paresExistentes = new Set(perms.map((p) => `${p.recurso_id}|${p.acao_id}`))

  const protegido = cargo.slug === 'super_admin'
  const podeEditar = isAdmin && !protegido

  return (
    <div className="view active">
      <div style={{ marginBottom: 14 }}>
        <Link href="/perfis" className="btn btn-ghost" style={{ fontSize: 12.5 }}>
          <i className="ti ti-chevron-left" /> Voltar aos perfis
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-shield-lock" style={{ color: 'var(--brand-500)' }} />
            {cargo.nome}
            {protegido && <i className="ti ti-lock" style={{ color: 'var(--brand-500)', fontSize: 16 }} title="Protegido" />}
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
            <span style={{ fontFamily: 'monospace' }}>{cargo.slug}</span>
            {cargo.descricao ? ` · ${cargo.descricao}` : ''}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
            <i className="ti ti-users" /> {vinculos.filter((v) => v.ativo).length.toLocaleString('pt-BR')} usuário(s) com este cargo ·{' '}
            <i className="ti ti-key" /> {concedidas.size.toLocaleString('pt-BR')} permissão(ões) concedida(s)
          </p>
        </div>
        <span className={`os-st ${cargo.ativo === false ? 'os-cancelada' : 'os-fechada'}`} style={{ alignSelf: 'center' }}>
          {cargo.ativo === false ? 'Inativo' : 'Ativo'}
        </span>
      </div>

      {!podeEditar && (
        <div className="modal-note" style={{ background: 'var(--amber-bg, #FFF7E6)', color: 'var(--amber, #B45309)', marginBottom: 14 }}>
          <i className="ti ti-info-circle" />{' '}
          {protegido
            ? 'O cargo Super Admin é a âncora do RBAC e não pode ser editado por aqui.'
            : 'Você está em modo leitura. Apenas o administrador geral edita perfis de acesso.'}
        </div>
      )}

      {/* Dados do perfil (legado: card "Dados do perfil"  Nome + Ativo) */}
      <DadosPerfilCard
        cargoId={cargo.id}
        nome={cargo.nome}
        descricao={cargo.descricao}
        ativo={cargo.ativo !== false}
        batePonto={cargo.bate_ponto !== false}
        podeEditar={podeEditar}
        temBatePonto={temBatePonto}
      />

      {/* Usuários vinculados (usuario_cargos) */}
      <VinculosUsuario
        cargoId={cargo.id}
        vinculos={vinculos}
        opcoes={opcoes}
        podeEditar={podeEditar}
      />

      <h3 style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, margin: '4px 0 12px' }}>
        <i className="ti ti-checklist" style={{ color: 'var(--brand-500)' }} /> Permissões
      </h3>

      <PermissoesGrid
        cargoId={cargo.id}
        recursos={recursos}
        acoes={acoes}
        inicial={inicial}
        paresExistentes={[...paresExistentes]}
        podeEditar={podeEditar}
      />
    </div>
  )
}
