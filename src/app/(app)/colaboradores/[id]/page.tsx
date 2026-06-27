import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ColaboradorFicha, type ColaboradorFull } from '@/components/colaboradores/ColaboradorFicha'

const PAPEIS_ESCRITA = ['admin_geral', 'gerente', 'recepcao']

export default async function ColaboradorFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  // Colaborador (a RLS garante o escopo; se a unidade ativa não bate, vem null).
  // Colunas de comissoes.sql (exibe_agenda, comissao_pct, etc.) → degrade se a migration
  // não foi aplicada (select sem elas).
  const COLS_BASE = 'id, unidade_id, perfil_id, nome, cpf, rg, data_nascimento, email, telefone, cargo, departamento, area, regime, tipo, data_admissao, data_demissao, status, salario_bruto, salario_liquido, banco, agencia, conta, pix, jornada_semanal_horas, jornada_diaria_horas, home_office_autorizado, endereco_residencial, criado_em'
  const COLS_FULL = `${COLS_BASE}, exibe_agenda, disponivel_online, comissao_pct, ordem_app, forcar_troca_senha, ultimo_acesso`
  const full = await sb.from('colaboradores').select(COLS_FULL).eq('id', id).maybeSingle()
  let row = full.data as Record<string, unknown> | null
  if (!row) {
    const r2 = await sb.from('colaboradores').select(COLS_BASE).eq('id', id).maybeSingle()
    row = r2.data as Record<string, unknown> | null
  }

  const colaborador = row as ColaboradorFull | null
  if (!colaborador) notFound()

  // Migration aplicada? (controla a habilitação dos campos das novas abas)
  const migracaoAplicada = !!row && 'comissao_pct' in (row as Record<string, unknown>)

  // nome da unidade de lotação (para exibição)
  let unidadeNome: string | null = null
  if (colaborador.unidade_id) {
    const { data: u } = await sb.from('unidades').select('nome').eq('id', colaborador.unidade_id).maybeSingle()
    unidadeNome = (u as { nome: string | null } | null)?.nome ?? null
  }

  return (
    <div className="view active">
      <Link href="/colaboradores" className="doc-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--text-2)', fontSize: 13, marginBottom: 8 }}>
        <i className="ti ti-arrow-left" /> Voltar aos colaboradores
      </Link>
      <ColaboradorFicha
        colaborador={colaborador}
        unidadeNome={unidadeNome}
        podeEscrever={podeEscrever}
        migracaoAplicada={migracaoAplicada}
      />
    </div>
  )
}
