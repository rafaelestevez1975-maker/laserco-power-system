'use client'

import Link from 'next/link'

type Valores = { q: string; acao: string; usuario: string; resultado: string; di: string; df: string }

type Props = {
  acoes: string[]
  usuarios: { id: string; nome: string }[]
  valores: Valores
}

/** Filtros da auditoria — form GET (server re-renderiza com os params). */
export function AuditoriaFiltros({ acoes, usuarios, valores }: Props) {
  const temFiltro = !!(valores.q || valores.acao || valores.usuario || valores.resultado || valores.di || valores.df)
  return (
    <form method="GET" action="/auditoria" className="rel-card" style={{ marginBottom: 14 }}>
      <div className="rel-card-h" style={{ cursor: 'default' }}>
        <span><i className="ti ti-filter flt" /> Filtros</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 12 }}>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Busca (ação / recurso)</label>
          <input type="text" name="q" defaultValue={valores.q} placeholder="Ex.: ticket, sac.avancar_etapa…" />
        </div>
        <div className="field">
          <label>Ação</label>
          <select name="acao" defaultValue={valores.acao}>
            <option value="">Todas</option>
            {acoes.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Usuário</label>
          <select name="usuario" defaultValue={valores.usuario}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Resultado</label>
          <select name="resultado" defaultValue={valores.resultado}>
            <option value="">Todos</option>
            <option value="sucesso">Sucesso</option>
            <option value="erro">Erro</option>
          </select>
        </div>
        <div className="field">
          <label>De</label>
          <input type="date" name="di" defaultValue={valores.di} />
        </div>
        <div className="field">
          <label>Até</label>
          <input type="date" name="df" defaultValue={valores.df} />
        </div>
      </div>
      <div className="rel-acts" style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary"><i className="ti ti-search" /> Pesquisar</button>
        {temFiltro && <Link href="/auditoria" className="btn"><i className="ti ti-x" /> Limpar</Link>}
      </div>
    </form>
  )
}
