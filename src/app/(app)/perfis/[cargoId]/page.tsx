import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'
import { PermissoesGrid, type Recurso, type Acao, type GridState } from '@/components/perfis/PermissoesGrid'

export const dynamic = 'force-dynamic'

type CargoRow = {
  id: string
  nome: string
  slug: string
  descricao: string | null
  is_sistema: boolean
  ativo: boolean
}

/** Editor da matriz recurso×ação de um cargo. Lê cargo_permissoes (estado atual) e
 *  monta o grid. O salvar (client → server action) PERSISTE de verdade. */
export default async function PerfilEditorPage({ params }: { params: Promise<{ cargoId: string }> }) {
  const { cargoId } = await params
  const ctx = await getSessionContext()
  const isAdmin = ehAdmin(ctx?.papel)
  const admin = adminClient()

  const { data: cargoRaw } = await admin
    .from('cargos')
    .select('id, nome, slug, descricao, is_sistema, ativo')
    .eq('id', cargoId)
    .maybeSingle()
  const cargo = cargoRaw as CargoRow | null
  if (!cargo) notFound()

  // Recursos (linhas, agrupados por módulo) + ações (colunas).
  const [{ data: recRaw }, { data: acoesRaw }, { data: permsRaw }, { data: cpRaw }, { count: nUsuarios }] = await Promise.all([
    admin.from('recursos').select('id, modulo, nome, descricao').order('modulo', { ascending: true }).order('id', { ascending: true }),
    admin.from('acoes').select('id, descricao').order('id', { ascending: true }),
    admin.from('permissoes').select('id, recurso_id, acao_id, escopo'),
    admin.from('cargo_permissoes').select('permissao_id').eq('cargo_id', cargoId),
    admin.from('usuario_cargos').select('id', { count: 'exact', head: true }).eq('cargo_id', cargoId).eq('ativo', true),
  ])

  const recursos = (recRaw ?? []) as Recurso[]
  const acoes = (acoesRaw ?? []) as Acao[]
  const perms = (permsRaw ?? []) as { id: string; recurso_id: string; acao_id: string; escopo: string }[]
  const concedidas = new Set(((cpRaw ?? []) as { permissao_id: string }[]).map((r) => r.permissao_id))

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
            <i className="ti ti-users" /> {(nUsuarios ?? 0).toLocaleString('pt-BR')} usuário(s) com este cargo ·{' '}
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
