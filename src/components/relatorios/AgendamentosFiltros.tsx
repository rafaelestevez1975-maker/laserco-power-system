'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

export type FiltroOpcao = { id: string; nome: string }

type Props = {
  /** Unidades ativas — vazio quando o contexto já fixa a unidade (franqueado). */
  unidades: FiltroOpcao[]
  colaboradores: FiltroOpcao[]
  servicos: FiltroOpcao[]
  /** valores atuais vindos da querystring */
  unidade: string
  profissional: string
  servico: string
}

/**
 * Filtros extras do relatório de Agendamentos (unidade / profissional / serviço).
 * Cada select muda um parâmetro da querystring preservando os demais (período etc.)
 *  a página (Server Component) re-renderiza com os novos counts.
 *
 * Componente próprio desta tela: RelFiltros é compartilhado por ~20 relatórios,
 * então NÃO é estendido aqui.
 */
export function AgendamentosFiltros({ unidades, colaboradores, servicos, unidade, profissional, servico }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function aplicar(chave: 'unidade' | 'profissional' | 'servico', valor: string) {
    const sp = new URLSearchParams(searchParams.toString())
    if (valor) sp.set(chave, valor)
    else sp.delete(chave)
    sp.delete('page') // reset de paginação, se houver
    const qs = sp.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  const labelStyle = {
    display: 'block',
    fontSize: 11.5,
    color: 'var(--text-3)',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '.4px',
  }

  return (
    <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
      {unidades.length > 0 && (
        <div>
          <label className="mf-l" style={labelStyle}>
            Unidade
          </label>
          <select className="mf" value={unidade} onChange={(e) => aplicar('unidade', e.target.value)}>
            <option value="">Todas as unidades</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mf-l" style={labelStyle}>
          Profissional
        </label>
        <select className="mf" value={profissional} onChange={(e) => aplicar('profissional', e.target.value)}>
          <option value="">Todos os profissionais</option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mf-l" style={labelStyle}>
          Serviço
        </label>
        <select className="mf" value={servico} onChange={(e) => aplicar('servico', e.target.value)}>
          <option value="">Todos os serviços</option>
          {servicos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
