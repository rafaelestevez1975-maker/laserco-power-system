'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarModelo, salvarModelo, excluirModelo } from '@/app/(app)/juridico/actions'

export type ModeloRow = {
  id: string
  nome: string
  assunto: string
  corpo: string
  ordem: number | null
}

/** Card de modelo com edição inline de assunto/corpo (jurModelos 4987-4994). */
function ModeloCard({ m }: { m: ModeloRow }) {
  const router = useRouter()
  const [nome, setNome] = useState(m.nome)
  const [assunto, setAssunto] = useState(m.assunto)
  const [corpo, setCorpo] = useState(m.corpo)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  const dirty = nome !== m.nome || assunto !== m.assunto || corpo !== m.corpo

  async function salvar() {
    setBusy(true)
    setErro(null)
    const r = await salvarModelo(m.id, { nome, assunto, corpo })
    setBusy(false)
    if (!r.ok) setErro(r.error || 'Falha ao salvar.')
    else { setSalvo(true); setTimeout(() => setSalvo(false), 1500); router.refresh() }
  }

  async function excluir() {
    if (!confirm(`Excluir o modelo "${m.nome}"?`)) return
    setBusy(true)
    setErro(null)
    const r = await excluirModelo(m.id)
    setBusy(false)
    if (!r.ok) setErro(r.error || 'Falha ao excluir.')
    else router.refresh()
  }

  return (
    <div className="rel-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <i className="ti ti-file-text" style={{ color: 'var(--brand-500)', fontSize: 18 }} />
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={busy}
          style={{ flex: 1, fontWeight: 700, border: '1px solid transparent', background: 'transparent', fontSize: 14, padding: '4px 6px', borderRadius: 6 }}
          onFocus={(e) => (e.target.style.border = '1px solid var(--line)')}
          onBlur={(e) => (e.target.style.border = '1px solid transparent')}
        />
        <button className="btn btn-ghost" disabled={busy} onClick={excluir} title="Excluir modelo" style={{ padding: '6px 9px' }}>
          <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
        </button>
      </div>

      <div className="mf full" style={{ marginBottom: 8 }}>
        <label>Assunto</label>
        <input value={assunto} onChange={(e) => setAssunto(e.target.value)} disabled={busy} />
      </div>
      <div className="mf full">
        <label>Mensagem (use {'{unidade}'}, {'{franqueado}'}, {'{cnpj}'}, {'{prazo}'}, {'{data}'})</label>
        <textarea
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
          rows={6}
          disabled={busy}
          style={{ width: '100%', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 10, fontSize: 12.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {erro && <div className="sim-msg err" style={{ marginTop: 8 }}><i className="ti ti-alert-triangle" /> {erro}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={salvar}>
          <i className="ti ti-device-floppy" /> Salvar
        </button>
        {salvo && <span style={{ fontSize: 12, color: 'var(--green)' }}><i className="ti ti-check" /> Salvo</span>}
      </div>
    </div>
  )
}

export function ModelosTab({ modelos, migrationPendente }: { modelos: ModeloRow[]; migrationPendente: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function novo() {
    setBusy(true)
    setErro(null)
    const r = await criarModelo()
    setBusy(false)
    if (!r.ok) setErro(r.error || 'Falha ao criar modelo.')
    else router.refresh()
  }

  return (
    <div>
      <div className="rel-legend">
        Modelos de notificação <b>pré-prontos e editáveis</b>. Os campos entre <b>{'{ }'}</b> são preenchidos
        automaticamente no envio (unidade, franqueado, CNPJ, prazo, data). Envio por <b>e-mail</b>.
      </div>

      <div className="rel-acts" style={{ justifyContent: 'flex-end', margin: '-4px 0 14px' }}>
        <button className="btn btn-primary" disabled={busy || migrationPendente} onClick={novo}>
          <i className="ti ti-plus" /> Novo modelo
        </button>
      </div>

      {erro && <div className="sim-msg err" style={{ marginBottom: 10 }}><i className="ti ti-alert-triangle" /> {erro}</div>}

      {modelos.length === 0 ? (
        <div className="sim-msg" style={{ background: 'var(--surface-2)' }}>
          <i className="ti ti-info-circle" /> Nenhum modelo cadastrado.{' '}
          {migrationPendente ? 'Aplique a migration para carregar os 7 modelos pré-prontos.' : 'Clique em “Novo modelo” para começar.'}
        </div>
      ) : (
        modelos.map((m) => <ModeloCard key={m.id} m={m} />)
      )}
    </div>
  )
}
