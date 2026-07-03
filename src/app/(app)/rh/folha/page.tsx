import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin, temPapel } from '@/lib/rbac'
import { FolhaView, type FolhaRow } from '@/components/rh/FolhaView'

export const dynamic = 'force-dynamic'

const PAPEIS_FOLHA = ['gestor', 'financeiro', 'rh']

/** "AAAA-MM" do mês atual e dos últimos N meses (para o seletor de competência). */
function competenciasRecentes(n = 12): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/**
 * RH · Folha de Pagamento  porta a tela "Folha" do portal RH (legacy/portal-rh.html):
 * Salário Bruto/Líquido, INSS, IRRF, FGTS, 13º e holerite por colaborador.
 * Cálculos em src/lib/rh.ts; dados persistidos em folha_pagamento (migration rh.sql).
 */
export default async function FolhaPage({ searchParams }: { searchParams: Promise<{ comp?: string }> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnitId = ctx?.activeUnitId ?? null
  const podeGerir = ehAdmin(ctx?.papel) || temPapel(ctx?.papel, ...PAPEIS_FOLHA)

  const competencias = competenciasRecentes(12)
  const competencia = sp.comp && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.comp) ? sp.comp : competencias[0]

  // Colaboradores do escopo (nome/cargo + filtro multitenant).
  let cq = sb.from('colaboradores').select('id, nome, cargo').limit(2000)
  if (activeUnitId) cq = cq.eq('unidade_id', activeUnitId)
  const { data: colabRaw } = await cq
  const colabs = (colabRaw ?? []) as { id: string; nome: string; cargo: string | null }[]
  const mapaColab = new Map(colabs.map((c) => [c.id, c]))
  const colabIds = colabs.map((c) => c.id)
  const restringe = !!activeUnitId && colabIds.length > 0

  // Folhas da competência (degrade se a migration não foi aplicada).
  let rows: FolhaRow[] = []
  let semDados = true
  try {
    let fq = sb
      .from('folha_pagamento')
      .select('id, colaborador_id, competencia, salario_bruto, inss, irrf, fgts, outros_proventos, outros_descontos, decimo_terceiro, salario_liquido, status')
      .eq('competencia', competencia)
      .order('salario_liquido', { ascending: false })
      .limit(2000)
    if (restringe) fq = fq.in('colaborador_id', colabIds)
    const { data, error } = await fq
    if (!error) {
      rows = ((data ?? []) as Omit<FolhaRow, 'colaboradorNome' | 'cargo'>[]).map((r) => {
        const c = mapaColab.get(r.colaborador_id)
        return { ...r, colaboradorNome: c?.nome ?? '', cargo: c?.cargo ?? null }
      })
      semDados = rows.length === 0
    }
  } catch { /* tabela ausente → semDados true */ }

  const kpis = rows.reduce(
    (a, r) => ({
      bruto: a.bruto + (r.salario_bruto || 0),
      liquido: a.liquido + (r.salario_liquido || 0),
      inss: a.inss + (r.inss || 0),
      irrf: a.irrf + (r.irrf || 0),
      fgts: a.fgts + (r.fgts || 0),
      total13: a.total13 + (r.decimo_terceiro || 0),
    }),
    { bruto: 0, liquido: 0, inss: 0, irrf: 0, fgts: 0, total13: 0 },
  )

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#E7F0EC', color: '#0f6b3a' }}><i className="ti ti-cash" /></div>
        <div>
          <h2>Folha de Pagamento</h2>
          <p>Salário bruto/líquido, INSS, IRRF, FGTS, 13º e holerite por colaborador.</p>
        </div>
        <Link href="/rh" className="btn btn-ghost" style={{ marginLeft: 'auto' }}><i className="ti ti-arrow-left" /> Dashboard RH</Link>
      </div>

      <FolhaView
        rows={rows}
        competencia={competencia}
        competencias={competencias}
        podeGerir={podeGerir}
        activeUnitId={activeUnitId}
        activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
        semDados={semDados}
        kpis={kpis}
      />
    </div>
  )
}
