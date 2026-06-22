'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { criarLead, moverLead } from '@/app/(app)/crm/actions'

export type Etapa = { id: string; nome: string; cor: string }
export type Lead = {
  id: string; nome: string | null; telefone: string | null; origem: string | null
  servico_interesse: string | null; valor_estimado: number | null; etapa_id: string | null; ia_score: number | null
}
export type Unidade = { id: string; nome: string }

const money = (v: number) => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR')
const waHref = (tel?: string | null) => {
  const d = (tel || '').replace(/\D/g, '')
  return d ? `https://wa.me/${d.startsWith('55') ? d : '55' + d}` : null
}
const temp = (s: number | null) => (s == null ? '' : s >= 0.7 ? '🔥' : s >= 0.4 ? '🌤️' : '❄️')

export function CrmBoard({
  etapas, leads: leadsProp, unidades, activeUnitId,
}: { etapas: Etapa[]; leads: Lead[]; unidades: Unidade[]; activeUnitId: string | null }) {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>(leadsProp)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => setLeads(leadsProp), [leadsProp])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? leads.filter((l) => (l.nome || '').toLowerCase().includes(q) || (l.servico_interesse || '').toLowerCase().includes(q))
    : leads

  async function onDragEnd(e: DragEndEvent) {
    const leadId = String(e.active.id)
    const etapaId = e.over ? String(e.over.id) : null
    if (!etapaId) return
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.etapa_id === etapaId) return
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, etapa_id: etapaId } : l))) // otimista
    const res = await moverLead(leadId, etapaId)
    if (!res.ok) { setLeads(leadsProp); alert(res.error || 'Não foi possível mover.') }
    else router.refresh()
  }

  return (
    <>
      <div className="crm-toolbar">
        <input placeholder="🔎 Buscar lead..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button className="btn"><i className="ti ti-adjustments" /> Personalizar funil</button>
          <button className="btn btn-primary" onClick={() => setModal(true)}><i className="ti ti-plus" /> Novo lead</button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban">
          {etapas.map((et) => (
            <Column key={et.id} etapa={et} leads={filtered.filter((l) => l.etapa_id === et.id)} />
          ))}
        </div>
      </DndContext>

      {modal && (
        <NovoLeadModal
          etapas={etapas} unidades={unidades} activeUnitId={activeUnitId}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); router.refresh() }}
        />
      )}
    </>
  )
}

function Column({ etapa, leads }: { etapa: Etapa; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  const soma = leads.reduce((s, l) => s + (l.valor_estimado || 0), 0)
  return (
    <div className="kan-col">
      <div className="kan-head">
        <span className="dot" style={{ background: etapa.cor }} />
        <span className="t">{etapa.nome}</span>
        <span className="cnt">{leads.length}</span>
      </div>
      <div className="kan-sum">{money(soma)} no estágio</div>
      <div ref={setNodeRef} className="kan-body" style={isOver ? { outline: '2px dashed var(--brand-400)', outlineOffset: -4, borderRadius: 8 } : undefined}>
        {leads.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Sem leads</div>}
        {leads.map((l) => <Card key={l.id} lead={l} />)}
      </div>
    </div>
  )
}

function Card({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })
  const wa = waHref(lead.telefone)
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1, cursor: 'grab',
  }
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="lead-card">
      <div className="lc-top">
        <span className="lc-name">{lead.nome || 'Lead'}</span>
        <span className="lc-temp">{temp(lead.ia_score)}</span>
      </div>
      {lead.servico_interesse && <div className="lc-serv">{lead.servico_interesse}</div>}
      <div className="lc-meta">
        <span className="lc-val">{lead.valor_estimado ? money(lead.valor_estimado) : '—'}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {lead.origem && <span className="orig-tag" style={{ fontSize: 10 }}>{lead.origem}</span>}
          {wa && (
            <a href={wa} target="_blank" rel="noopener" className="wa-link" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
              <i className="ti ti-brand-whatsapp wa" />
            </a>
          )}
        </span>
      </div>
    </div>
  )
}

function NovoLeadModal({
  etapas, unidades, activeUnitId, onClose, onSaved,
}: { etapas: Etapa[]; unidades: Unidade[]; activeUnitId: string | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nome: '', telefone: '', origem: 'manual', servico_interesse: '', valor_estimado: '',
    unidade_id: activeUnitId || unidades[0]?.id || '',
    etapa_id: etapas[0]?.id || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setSaving(true)
    const res = await criarLead({
      nome: f.nome, telefone: f.telefone, origem: f.origem, servico_interesse: f.servico_interesse,
      valor_estimado: f.valor_estimado ? Number(String(f.valor_estimado).replace(/\./g, '').replace(',', '.')) : null,
      unidade_id: f.unidade_id, etapa_id: f.etapa_id,
    })
    setSaving(false)
    if (!res.ok) setErr(res.error || 'Erro ao salvar.')
    else onSaved()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="lc-card" style={{ width: '100%', maxWidth: 460, padding: 22, background: '#fff' }}>
        <h3 className="lc-title" style={{ fontSize: 18, marginBottom: 14 }}>Novo lead</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Nome *</label><input style={inp} value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Telefone</label><input style={inp} value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(48) 99999-9999" /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Valor estimado</label><input style={inp} value={f.valor_estimado} onChange={(e) => set('valor_estimado', e.target.value)} placeholder="0,00" /></div>
          </div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Serviço de interesse</label><input style={inp} value={f.servico_interesse} onChange={(e) => set('servico_interesse', e.target.value)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Origem</label>
              <select style={inp} value={f.origem} onChange={(e) => set('origem', e.target.value)}>
                <option value="manual">Manual</option>
                <option value="formulario">Formulário</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="indicacao">Indicação</option>
                <option value="google">Google</option>
                <option value="outros">Outros</option>
              </select>
            </div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Etapa</label>
              <select style={inp} value={f.etapa_id} onChange={(e) => set('etapa_id', e.target.value)}>
                {etapas.map((et) => <option key={et.id} value={et.id}>{et.nome}</option>)}
              </select>
            </div>
          </div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Unidade *</label>
            <select style={inp} value={f.unidade_id} onChange={(e) => set('unidade_id', e.target.value)}>
              <option value="">Selecione…</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Criar lead'}</button>
        </div>
      </form>
    </div>
  )
}
