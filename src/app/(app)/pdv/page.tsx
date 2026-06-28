import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { descLimitFor, CORTESIA_LIMIT_MES, inicioDoMes } from '@/lib/pdv'
import { PdvManager, type CatalogoItem, type Opcao } from '@/components/pdv/PdvManager'

export const dynamic = 'force-dynamic'

const PAPEIS_VENDA = ['operacoes', 'gestor']

export default async function PdvPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const podeVender = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_VENDA.includes(ctx.papel))
  const descLimit = descLimitFor(ctx?.papel)

  // ── Catálogo (serviços/produtos/pacotes ativos) ──
  const [servRes, prodRes, pacRes] = await Promise.all([
    sb.from('servicos').select('id, nome, grupo, preco_padrao').eq('ativo', true).order('nome').range(0, 999),
    sb.from('produtos').select('id, nome, grupo, preco_padrao').eq('ativo', true).order('nome').range(0, 999),
    sb.from('pacotes').select('id, nome, preco').eq('ativo', true).order('nome').range(0, 999),
  ])

  const servicos: CatalogoItem[] = ((servRes.data ?? []) as { id: string; nome: string | null; grupo: string | null; preco_padrao: number | null }[])
    .map((s) => ({ kind: 'servico', id: s.id, nome: s.nome || '(sem nome)', grupo: (s.grupo || '').trim() || null, preco: Number(s.preco_padrao) || 0 }))
  const produtos: CatalogoItem[] = ((prodRes.data ?? []) as { id: string; nome: string | null; grupo: string | null; preco_padrao: number | null }[])
    .map((p) => ({ kind: 'produto', id: p.id, nome: p.nome || '(sem nome)', grupo: (p.grupo || '').trim() || null, preco: Number(p.preco_padrao) || 0 }))
  const pacotes: CatalogoItem[] = ((pacRes.data ?? []) as { id: string; nome: string | null; preco: number | null }[])
    .map((p) => ({ kind: 'pacote', id: p.id, nome: p.nome || '(sem nome)', grupo: null, preco: Number(p.preco) || 0 }))

  // ── Clientes ativos (datalist/picker) + vendedores ──
  const { data: cliRaw } = await sb.from('clientes').select('id, nome').eq('ativo', true).order('nome').range(0, 999)
  const clientes: Opcao[] = ((cliRaw ?? []) as { id: string; nome: string | null }[]).map((c) => ({ id: c.id, nome: c.nome || '(sem nome)' }))

  const { data: vendRaw } = await sb.from('perfis_usuario').select('id, nome_completo').eq('ativo', true).order('nome_completo').range(0, 499)
  const vendedores: Opcao[] = ((vendRaw ?? []) as { id: string; nome_completo: string | null }[]).map((v) => ({ id: v.id, nome: v.nome_completo || '(sem nome)' }))

  // ── Cortesias já usadas no mês nesta unidade (p/ exibir saldo do teto) ──
  // Gate por `criado_em` (sempre preenchido) e não por `fechada_em`: cortesias importadas/legadas
  // sem `fechada_em` ficavam fora da conta e furavam o teto. Mesma regra usada no bloqueio real
  // em finalizarVenda (actions.ts) — saldo exibido e bloqueio precisam bater.
  let cortesiaUsada = 0
  if (unidadeId) {
    const { data: cort, error: eCort } = await sb
      .from('os')
      .select('total_bruto')
      .eq('unidade_id', unidadeId)
      .eq('status', 'fechada')
      .eq('total', 0)
      .gte('criado_em', inicioDoMes(new Date().toISOString()))
    if (!eCort) {
      cortesiaUsada = ((cort ?? []) as { total_bruto: number | null }[]).reduce((s, r) => s + (Number(r.total_bruto) || 0), 0)
    }
  }

  return (
    <div className="view active">
      <PdvManager
        activeUnitId={unidadeId}
        activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
        podeVender={podeVender}
        descLimit={descLimit}
        cortesiaUsada={cortesiaUsada}
        cortesiaLimite={CORTESIA_LIMIT_MES}
        servicos={servicos}
        produtos={produtos}
        pacotes={pacotes}
        clientes={clientes}
        vendedores={vendedores}
        vendedorPadrao={ctx?.nome ?? ''}
      />
    </div>
  )
}
