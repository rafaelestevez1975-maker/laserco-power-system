/**
 * Geração resiliente do `os.numero` (max+1 escopado por unidade).
 *
 * O backend lkii não tem sequence/default para `os.numero`. Calcular max(numero)+1 e inserir em
 * dois fluxos simultâneos na mesma unidade (duas vendas no PDV, ou abrirOS concorrente) lê o mesmo
 * max e gera NÚMERO DUPLICADO de OS — bug de corrida real (cliente reclamou de confiabilidade).
 *
 * Mitigação possível na camada de app, sem migration: insert otimista + retry. Se a base rejeitar
 * por unique violation (23505) — quando há índice único em (unidade_id, numero) — recomputamos o
 * próximo número e tentamos de novo. É a defesa mais segura/simples sem mexer no schema.
 * //TODO(needs-migration: sequence/índice único por unidade para `os.numero` garantirem unicidade no banco).
 */
import type { SB } from '@/lib/sb'

const ehDuplicado = (m: string | null | undefined) => /duplicate|23505|unique/i.test(m || '')

export async function inserirOSComNumero(
  sb: SB,
  unidadeId: string,
  campos: Record<string, unknown>,
  tentativas = 5,
): Promise<{ id: string; numero: number } | { error: string }> {
  let ultimoErro = 'gerar número da OS'
  for (let i = 0; i < tentativas; i++) {
    const { data: ult } = await sb
      .from('os')
      .select('numero')
      .eq('unidade_id', unidadeId)
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle()
    const numero = ((ult as { numero: number } | null)?.numero ?? 0) + 1

    const { data, error } = await sb
      .from('os')
      .insert({ ...campos, numero, unidade_id: unidadeId })
      .select('id')
      .single()

    if (!error) return { id: (data as { id: string }).id, numero }
    if (!ehDuplicado(error.message)) return { error: error.message }
    ultimoErro = error.message // colisão de numero: recomputa e tenta de novo
  }
  return { error: ultimoErro }
}
