'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { moedaBR, waHref } from '@/lib/fmt'
import { criarLeadFranquia, moverEtapa } from '@/app/(app)/expansao/actions'
import {
  type ExpEtapa, type ExpLead, type ExpUnidade, TIPOS_LEAD, TEMPERATURAS, corTipo, metaTemp,
} from './types'

const money = moedaBR

export function ExpansaoBoard({
  etapas, leads: leadsProp, unidades, activeUnitId, isAdmin,
}: {
  etapas: ExpEtapa[]; leads: ExpLead[]; unidades: ExpUnidade[]; activeUnitId: string | null; isAdmin: boolean
}) {
  const router = useRouter()
  const [leads, setLeads] = useState<ExpLead[]>(leadsProp)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => setLeads(leadsProp), [leadsProp])

  // Pode escrever: admin geral sempre; demais precisam de unidade ativa (RLS confirma).
  const podeCriar = isAdmin || !!activeUnitId

  const q = search.trim().toLowerCase()
  const filtered = q
    ? leads.filter((l) =>
        (l.nome || '').toLowerCase().includes(q) ||
        (l.tipo_lead || '').toLowerCase().includes(q) ||
        (l.telefone || '').includes(q))
    : leads

  async function onDragEnd(e: DragEndEvent) {
    const leadId = String(e.active.id)
    const etapaId = e.over ? String(e.over.id) : null
    if (!etapaId) return
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.etapa_id === etapaId) return
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, etapa_id: etapaId } : l))) // otimista
    const res = await moverEtapa(leadId, etapaId)
    if (!res.ok) { setLeads(leadsProp); alert(res.error || 'Não foi possível mover.') }
    else router.refresh()
  }

  if (etapas.length === 0) {
    return <div className="rel-card" style={{ textAlign: 'center', color: 'var(--text-3)' }}>Nenhuma etapa de funil de franquia configurada.</div>
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <input
          placeholder="🔎 Buscar candidato..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 220, padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} lead(s)</span>
        <div style={{ marginLeft: 'auto' }}>
          {podeCriar
            ? <button className="btn btn-primary" onClick={() => setModal(true)}><i className="ti ti-plus" /> Novo lead</button>
            : <button className="btn" disabled title="Selecione uma unidade para cadastrar"><i className="ti ti-plus" /> Novo lead</button>}
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
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

function Column({ etapa, leads }: { etapa: ExpEtapa; leads: ExpLead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  const soma = leads.reduce((s, l) => s + (l.valor_estimado || 0), 0)
  return (
    <div style={{ minWidth: 240, flex: '0 0 240px', background: 'var(--surface-2)', borderRadius: 10, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: etapa.cor }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: etapa.cor }} />{etapa.nome}
        </span>
        <span style={{ fontSize: 11, background: etapa.cor + '22', color: etapa.cor, padding: '1px 8px', borderRadius: 10 }}>{leads.length}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>{money(soma)} no estágio</div>
      <div ref={setNodeRef} style={isOver ? { outline: '2px dashed var(--brand-400)', outlineOffset: -4, borderRadius: 8, minHeight: 40 } : { minHeight: 40 }}>
        {leads.length === 0 && <div style={{ padding: 8, fontSize: 11.5, color: 'var(--text-3)' }}>Sem leads</div>}
        {leads.map((l) => <Card key={l.id} lead={l} />)}
      </div>
    </div>
  )
}

function Card({ lead }: { lead: ExpLead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })
  const wa = waHref(lead.telefone)
  const tmp = metaTemp(lead.temperatura)
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1, cursor: 'grab',
    background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 10px', marginBottom: 7,
  }
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{lead.nome || 'Lead'}</span>
        {wa && (
          <a href={wa} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={{ color: '#25D366' }}>
            <i className="ti ti-brand-whatsapp" />
          </a>
        )}
      </div>
      {(lead.empresa || lead.uf) ? <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '3px 0' }}>{[lead.empresa, lead.uf].filter(Boolean).join(' · ')}</div> : null}
      {lead.valor_estimado ? <div style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '3px 0' }}>{money(lead.valor_estimado)}</div> : null}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
        {lead.tipo_lead && <span className="os-st" style={{ fontSize: 10.5, background: corTipo(lead.tipo_lead) + '22', color: corTipo(lead.tipo_lead) }}>{lead.tipo_lead}</span>}
        {lead.temperatura && <span className="os-st" style={{ fontSize: 10.5, background: tmp.cor + '22', color: tmp.cor }}>{tmp.label}</span>}
        {lead.origem && <span className="os-st" style={{ fontSize: 10.5, background: 'var(--line)', color: 'var(--text-2)' }}>{lead.origem}</span>}
      </div>
    </div>
  )
}

const ORIGENS_OPT = [
  { v: 'site', l: 'Site (website)' }, { v: 'geolocalizado', l: 'Geolocalizado' },
  { v: 'instagram', l: 'Instagram' }, { v: 'whatsapp', l: 'WhatsApp' },
  { v: 'indicacao', l: 'Indicação' }, { v: 'google', l: 'Google' },
  { v: 'manual', l: 'Manual' }, { v: 'outros', l: 'Outros' },
]

function NovoLeadModal({
  etapas, unidades, activeUnitId, onClose, onSaved,
}: { etapas: ExpEtapa[]; unidades: ExpUnidade[]; activeUnitId: string | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nome: '', telefone: '', email: '', empresa: '', uf: '', origem: 'site', tipo_lead: 'Franquia', temperatura: 'morno',
    valor_estimado: '', unidade_id: activeUnitId || unidades[0]?.id || '', etapa_id: etapas[0]?.id || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setSaving(true)
    const res = await criarLeadFranquia({
      nome: f.nome, telefone: f.telefone, email: f.email, empresa: f.empresa, uf: f.uf, origem: f.origem,
      tipo_lead: f.tipo_lead, temperatura: f.temperatura,
      valor_estimado: f.valor_estimado ? Number(String(f.valor_estimado).replace(/\./g, '').replace(',', '.')) : null,
      unidade_id: f.unidade_id, etapa_id: f.etapa_id,
    })
    setSaving(false)
    if (!res.ok) setErr(res.error || 'Erro ao salvar.')
    else onSaved()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600 }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{ width: '100%', maxWidth: 480, padding: 22, background: '#fff', borderRadius: 14 }}>
        <h3 style={{ fontSize: 18, marginBottom: 14 }}><i className="ti ti-map-pin-plus" /> Novo lead de franquia</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <div><label style={lbl}>Nome *</label><input style={inp} value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Telefone</label><input style={inp} value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(11) 99999-9999" /></div>
            <div><label style={lbl}>E-mail</label><input style={inp} value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="email@exemplo.com" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Empresa</label><input style={inp} value={f.empresa} onChange={(e) => set('empresa', e.target.value)} placeholder="Clínica X" /></div>
            <div><label style={lbl}>UF</label><input style={inp} value={f.uf} maxLength={2} onChange={(e) => set('uf', e.target.value.toUpperCase())} placeholder="SP" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Tipo de lead</label>
              <select style={inp} value={f.tipo_lead} onChange={(e) => set('tipo_lead', e.target.value)}>
                {TIPOS_LEAD.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Temperatura</label>
              <select style={inp} value={f.temperatura} onChange={(e) => set('temperatura', e.target.value)}>
                {TEMPERATURAS.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Origem</label>
              <select style={inp} value={f.origem} onChange={(e) => set('origem', e.target.value)}>
                {ORIGENS_OPT.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Valor estimado (R$)</label><input style={inp} value={f.valor_estimado} onChange={(e) => set('valor_estimado', e.target.value)} placeholder="0,00" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Etapa</label>
              <select style={inp} value={f.etapa_id} onChange={(e) => set('etapa_id', e.target.value)}>
                {etapas.map((et) => <option key={et.id} value={et.id}>{et.nome}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Unidade *</label>
              <select style={inp} value={f.unidade_id} onChange={(e) => set('unidade_id', e.target.value)}>
                <option value="">Selecione…</option>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
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
