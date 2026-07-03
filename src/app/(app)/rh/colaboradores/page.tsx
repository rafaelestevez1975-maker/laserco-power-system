import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ColaboradoresList, type ColaboradorRow } from '@/components/colaboradores/ColaboradoresList'
import { NovoColaboradorModal } from '@/components/colaboradores/NovoColaboradorModal'
import { PERFIL_LABELS } from '@/components/colaboradores/labels'
import { RhColabFiltros } from '@/components/rh/RhColabFiltros'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const PAPEIS_ESCRITA = ['admin_geral', 'gerente', 'recepcao', 'gestor', 'rh']

type SP = { q?: string; status?: string; regime?: string; cargo?: string; area?: string; page?: string }

/**
 * RH · Colaboradores  porta a tela "Colaboradores" do portal RH (legacy/portal-rh.html)
 * e o cadastro completo de admissão (_empFromColab, index.html ~7059: nome, cpf, rg,
 * nascimento, contatos, endereços, dados bancários, cargo, salário, contrato, horário/escala).
 *
 * Reaproveita os componentes do cadastro de colaboradores do PowerSystem (a "bridge"
 * COLAB ⇄ rh_employees do legado vira a MESMA tabela `colaboradores` aqui  sem
 * sincronização localStorage). O formulário de admissão tem os ~30 campos do schema.
 */
export default async function RhColaboradoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { q, status = 'ativo', regime, cargo, area, page: pageRaw } = sp
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE

  const COLS = 'id, nome, cpf, telefone, email, cargo, area, departamento, regime, tipo, status, data_admissao'
  let qy = sb.from('colaboradores').select(COLS, { count: 'exact' }).order('nome', { ascending: true }).range(from, from + PAGE_SIZE - 1)
  if (activeUnit) qy = qy.eq('unidade_id', activeUnit)
  if (status === 'ativo') qy = qy.eq('status', 'ativo')
  else if (status === 'inativo') qy = qy.eq('status', 'inativo')
  if (regime === 'clt' || regime === 'pj') qy = qy.eq('regime', regime)
  if (cargo) qy = qy.eq('cargo', cargo)
  if (area) qy = qy.ilike('area', `%${area}%`)
  if (q) {
    const qs = q.replace(/[,()*]/g, ' ').trim()
    if (qs) {
      const d = qs.replace(/\D/g, '')
      const ors = [`nome.ilike.%${qs}%`, `email.ilike.%${qs}%`, `cargo.ilike.%${qs}%`]
      if (d) { ors.push(`cpf.ilike.%${d}%`, `telefone.ilike.%${d}%`) }
      qy = qy.or(ors.join(','))
    }
  }
  const { data, count } = await qy
  const colaboradores = (data ?? []) as ColaboradorRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(q || regime || cargo || area || status !== 'ativo')

  let areaQuery = sb.from('colaboradores').select('area').not('area', 'is', null).limit(1000)
  if (activeUnit) areaQuery = areaQuery.eq('unidade_id', activeUnit)
  const { data: areasRaw } = await areaQuery
  const areas = [...new Set(((areasRaw ?? []) as { area: string | null }[]).map((r) => r.area).filter((a): a is string => !!a))].sort()
  const unidadeSugerida = activeUnit ?? (ctx?.unidades?.[0]?.id ?? null)

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#E7F0EC', color: '#0f6b3a' }}><i className="ti ti-users" /></div>
        <div>
          <h2>RH · Colaboradores</h2>
          <p>Cadastro completo de admissão e ficha do colaborador · {ctx?.activeUnitName ?? 'Todas as unidades'}.</p>
        </div>
        <Link href="/rh" className="btn btn-ghost" style={{ marginLeft: 'auto' }}><i className="ti ti-arrow-left" /> Dashboard RH</Link>
      </div>

      <div className="mod-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 10 }}>
        {podeEscrever && (
          <NovoColaboradorModal unidades={ctx?.unidades ?? []} unidadeSugerida={unidadeSugerida} isAdmin={ctx?.isAdmin ?? false} activeUnitId={activeUnit} />
        )}
      </div>

      <RhColabFiltros areas={areas} cargos={Object.entries(PERFIL_LABELS)} />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-filter" /> {total.toLocaleString('pt-BR')} colaborador(es){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages.toLocaleString('pt-BR')}
        {activeUnit ? ` · ${ctx?.activeUnitName}` : ' · todas as unidades'}
      </div>

      <ColaboradoresList colaboradores={colaboradores} page={page} totalPages={totalPages} basePath="/rh/colaboradores" searchParams={sp} podeEscrever={podeEscrever} />
    </div>
  )
}
