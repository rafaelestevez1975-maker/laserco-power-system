'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarDadosUnidade } from '@/app/(app)/minha-unidade/actions'

export type UnidadeDados = {
  id: string
  nome: string | null
  cnpj: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  ativa: boolean | null
  bemp_salon_id: number | null
}

type Aba = 'dados' | 'horarios' | 'bloqueios' | 'fotos' | 'nfse'

const ABAS: { id: Aba; label: string; icon: string }[] = [
  { id: 'dados', label: 'Dados básicos', icon: 'ti-building' },
  { id: 'horarios', label: 'Horários', icon: 'ti-clock' },
  { id: 'bloqueios', label: 'Bloqueios', icon: 'ti-calendar-off' },
  { id: 'fotos', label: 'Fotos', icon: 'ti-photo' },
  { id: 'nfse', label: 'NFS-e', icon: 'ti-file-invoice' },
]

export function MinhaUnidadePanel({ dados, podeEditar, activeUnitName, semUnidade }: {
  dados: UnidadeDados | null
  podeEditar: boolean
  activeUnitName: string
  semUnidade: boolean
}) {
  const [aba, setAba] = useState<Aba>('dados')

  return (
    <div className="view active">
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-building-bank" style={{ color: 'var(--brand-500)' }} /> Minha unidade
          <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 400 }}>· {activeUnitName}</span>
        </h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
          Dados e configurações da unidade ativa selecionada no topo.
        </p>
      </div>

      {semUnidade ? (
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-building-off" style={{ fontSize: 26, display: 'block', marginBottom: 10 }} />
          Selecione uma unidade no topo para ver e editar seus dados.
        </div>
      ) : (
        <>
          <div className="rel-tabs" style={{ marginBottom: 16 }}>
            {ABAS.map((a) => (
              <div key={a.id} className={`rel-tab ${aba === a.id ? 'active' : ''}`} onClick={() => setAba(a.id)}>
                <i className={`ti ${a.icon}`} style={{ marginRight: 6 }} /> {a.label}
              </div>
            ))}
          </div>

          {aba === 'dados' && dados && <DadosBasicos dados={dados} podeEditar={podeEditar} />}
          {aba === 'horarios' && <NeedsTable titulo="Horários de funcionamento" tabela="unidade_horarios" descricao="Defina os horários de abertura e fechamento por dia da semana." icon="ti-clock" />}
          {aba === 'bloqueios' && <NeedsTable titulo="Bloqueios de agenda" tabela="unidade_bloqueios" descricao="Bloqueios recorrentes ou pontuais (almoço da equipe, manutenção, treinamentos)." icon="ti-calendar-off" />}
          {aba === 'fotos' && <NeedsTable titulo="Fotos da unidade" tabela="unidade_fotos" descricao="Galeria de fotos exibida no perfil público da unidade." icon="ti-photo" />}
          {aba === 'nfse' && <NeedsTable titulo="Emissão de NFS-e" tabela="unidade_nfse_config" descricao="Configuração de emissão de notas fiscais de serviço (certificado, regime, série)." icon="ti-file-invoice" />}
        </>
      )}
    </div>
  )
}

// ─────────────────────────── Aba: Dados básicos (editável) ───────────────────────────

function DadosBasicos({ dados, podeEditar }: { dados: UnidadeDados; podeEditar: boolean }) {
  const router = useRouter()
  const [f, setF] = useState({
    nome: dados.nome ?? '',
    cnpj: dados.cnpj ?? '',
    endereco: dados.endereco ?? '',
    cidade: dados.cidade ?? '',
    estado: dados.estado ?? '',
    cep: dados.cep ?? '',
  })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    if (!f.nome.trim()) { setErr('Informe o nome da unidade.'); return }
    if (f.estado.trim() && f.estado.trim().length !== 2) { setErr('UF deve ter 2 letras (ex.: SP).'); return }
    setSaving(true)
    const r = await salvarDadosUnidade({
      id: dados.id,
      nome: f.nome,
      cnpj: f.cnpj || null,
      endereco: f.endereco || null,
      cidade: f.cidade || null,
      estado: f.estado || null,
      cep: f.cep || null,
    })
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    setMsg('Dados da unidade salvos.')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="rel-card">
      <div className="rel-card-h" style={{ cursor: 'default' }}>
        <span><i className="ti ti-building flt" /> Dados básicos</span>
        <span>
          {dados.ativa === false
            ? <span className="os-st os-cancelada"><i className="ti ti-ban" /> Inativa</span>
            : <span className="os-st os-fechada"><i className="ti ti-circle-check" /> Ativa</span>}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <div className="mf full" style={{ gridColumn: '1 / -1' }}>
          <label>Nome <span className="req">*</span></label>
          <input value={f.nome} onChange={(e) => set('nome', e.target.value)} disabled={!podeEditar} />
        </div>
        <div className="mf">
          <label>CNPJ</label>
          <input value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" disabled={!podeEditar} />
        </div>
        <div className="mf">
          <label>CEP</label>
          <input value={f.cep} onChange={(e) => set('cep', e.target.value)} disabled={!podeEditar} />
        </div>
        <div className="mf full" style={{ gridColumn: '1 / -1' }}>
          <label>Endereço</label>
          <input value={f.endereco} onChange={(e) => set('endereco', e.target.value)} disabled={!podeEditar} />
        </div>
        <div className="mf">
          <label>Cidade</label>
          <input value={f.cidade} onChange={(e) => set('cidade', e.target.value)} disabled={!podeEditar} />
        </div>
        <div className="mf">
          <label>UF</label>
          <input value={f.estado} onChange={(e) => set('estado', e.target.value.toUpperCase())} maxLength={2} placeholder="SP" disabled={!podeEditar} />
        </div>
      </div>
      {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 12 }}>{err}</p>}
      {msg && <p style={{ color: 'var(--brand-600)', fontSize: 12.5, marginTop: 12 }}>{msg}</p>}
      {podeEditar ? (
        <div className="rel-acts" style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : (<><i className="ti ti-device-floppy" /> Salvar alterações</>)}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 12 }}>
          <i className="ti ti-eye" /> Somente leitura — edição restrita à gestão da unidade.
        </p>
      )}
    </form>
  )
}

// ─────────────────────────── Estado-vazio honesto (sem tabela no lkii) ───────────────────────────

function NeedsTable({ titulo, tabela, descricao, icon }: { titulo: string; tabela: string; descricao: string; icon: string }) {
  // TODO(needs-table) — feature fiel ao legado, mas sem tabela no backend lkii ainda.
  return (
    <div className="rel-card">
      <div className="rel-card-h" style={{ cursor: 'default' }}>
        <span><i className={`ti ${icon} flt`} /> {titulo}</span>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 10 }}>{descricao}</p>
      <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: 10, marginTop: 12 }}>
        <i className="ti ti-database-off" style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
        Ainda não disponível neste ambiente.
        <span style={{ display: 'block', fontSize: 11, marginTop: 6 }}>
          Aguardando a tabela <code>{tabela}</code> no backend.
        </span>
      </div>
    </div>
  )
}
