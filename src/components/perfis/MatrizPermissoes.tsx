'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarPermissoesCargo } from '@/app/(app)/perfis/actions'

type Cargo = { id: string; nome: string; slug: string; is_sistema: boolean }
type Modulo = { modulo: string; recursos: { id: string; nome: string }[] }

const MOD_LABEL: Record<string, string> = {
  sac: 'SAC', financeiro: 'Financeiro', rh: 'RH', crm: 'CRM', operacoes: 'Operações', marketing: 'Marketing',
  sistema: 'Sistema', expansao: 'Expansão', relatorios: 'Relatórios', agenda: 'Agenda', cadastros: 'Cadastros', outros: 'Outros',
}

/** Matriz de permissões estilo ABV: recurso × ação (linhas, por módulo colapsável) × cargos (colunas).
 *  Marcar = concede o par (escopo 'global' se for NOVO; preserva o escopo atual de quem já tem);
 *  desmarcar = remove. Salva por cargo (só o diff) via salvarPermissoesCargo — valida, persiste e audita. */
export function MatrizPermissoes({ cargos, acoes, acaoLabel, modulos, checked }: {
  cargos: Cargo[]; acoes: string[]; acaoLabel: Record<string, string>; modulos: Modulo[]; checked: Record<string, string[]>
}) {
  const router = useRouter()
  const [state, setState] = useState<Record<string, Set<string>>>(() => {
    const o: Record<string, Set<string>> = {}
    for (const c of cargos) o[c.id] = new Set(checked[c.id] ?? [])
    return o
  })
  const [dirty, setDirty] = useState<Record<string, Set<string>>>({})
  const [open, setOpen] = useState<Record<string, boolean>>(() => (modulos[0] ? { [modulos[0].modulo]: true } : {}))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const k = (r: string, a: string) => `${r}|${a}`
  const on = (cid: string, r: string, a: string) => state[cid]?.has(k(r, a)) ?? false

  function toggle(cid: string, r: string, a: string) {
    const key = k(r, a)
    setState((p) => { const s = new Set(p[cid]); if (s.has(key)) s.delete(key); else s.add(key); return { ...p, [cid]: s } })
    setDirty((p) => { const s = new Set(p[cid] ?? []); s.add(key); return { ...p, [cid]: s } })
  }

  const totalDirty = useMemo(() => Object.values(dirty).reduce((n, s) => n + s.size, 0), [dirty])

  async function salvar() {
    setSaving(true); setMsg('')
    let ok = 0, fail = 0
    for (const cid of Object.keys(dirty)) {
      const ks = dirty[cid]
      if (!ks.size) continue
      const changes = [...ks].map((key) => {
        const [recurso_id, acao_id] = key.split('|')
        return { recurso_id, acao_id, escopo: state[cid].has(key) ? ('global' as const) : null }
      })
      const r = await salvarPermissoesCargo(cid, changes)
      if (r.ok) ok++; else fail++
    }
    setSaving(false); setDirty({})
    setMsg(fail ? `Salvo em ${ok} cargo(s); ${fail} falharam.` : `✅ Permissões salvas (${ok} cargo(s)).`)
    router.refresh()
  }

  const th: React.CSSProperties = { position: 'sticky', top: 0, background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', padding: '8px 6px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', zIndex: 2 }
  const firstCol: React.CSSProperties = { position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1, padding: '5px 10px', fontSize: 12, whiteSpace: 'nowrap', borderRight: '1px solid var(--line)', minWidth: 150 }

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#EFE9F7', color: 'var(--brand-500)' }}><i className="ti ti-table" /></div>
        <div><h2>Matriz de Permissões</h2><p>Marque o que cada cargo pode acessar (recurso × ação). O Administrador sempre tem acesso total.</p></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, margin: '0 0 14px', position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', padding: '6px 0' }}>
        <span style={{ fontSize: 12.5, color: msg.startsWith('✅') ? 'var(--green)' : 'var(--brand-600)' }}>{msg || (totalDirty ? `${totalDirty} alteração(ões) não salva(s)` : 'Sem alterações.')}</span>
        <button className="btn btn-primary" disabled={saving || !totalDirty} onClick={salvar}>{saving ? 'Salvando…' : <><i className="ti ti-device-floppy" /> Salvar permissões</>}</button>
      </div>

      {modulos.map((m) => {
        const aberto = open[m.modulo]
        return (
          <div key={m.modulo} className="rel-card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
            <div onClick={() => setOpen((o) => ({ ...o, [m.modulo]: !o[m.modulo] }))} style={{ cursor: 'pointer', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5 }}>
              <i className="ti ti-chevron-right" style={{ transition: 'transform .2s', transform: aberto ? 'rotate(90deg)' : 'none' }} />
              {MOD_LABEL[m.modulo] || m.modulo} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>({m.recursos.length} recurso(s))</span>
            </div>
            {aberto && (
              <div style={{ overflowX: 'auto', maxHeight: '70vh', borderTop: '1px solid var(--line)' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, ...firstCol, top: 0, left: 0, zIndex: 3 }}>Recurso · Ação</th>
                      {cargos.map((c) => <th key={c.id} style={th} title={c.slug}>{c.nome}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {m.recursos.map((rec) => acoes.map((a, ai) => (
                      <tr key={rec.id + a} style={{ borderTop: ai === 0 ? '2px solid var(--line)' : '1px solid var(--surface-2)' }}>
                        <td style={firstCol}>
                          {ai === 0 && <b style={{ display: 'block', fontSize: 12.5 }}>{rec.nome}</b>}
                          <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{acaoLabel[a] || a}</span>
                        </td>
                        {cargos.map((c) => (
                          <td key={c.id} style={{ textAlign: 'center', padding: '3px 8px' }}>
                            <input type="checkbox" checked={on(c.id, rec.id, a)} onChange={() => toggle(c.id, rec.id, a)} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                          </td>
                        ))}
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
