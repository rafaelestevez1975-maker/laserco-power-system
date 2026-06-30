'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarCanal, salvarVinculo, conectarCanal, statusCanal, desconectarCanal, sincronizarCanal, excluirCanal, type Escopo } from '@/app/(app)/canais/actions'

export type Canal = {
  name: string; status: string; owner?: string
  vinculado: boolean; bindingId?: string
  escopo?: Escopo; unidadeId?: string | null; unidadeNome?: string | null
  atendenteId?: string | null; atendenteNome?: string | null
  rotulo?: string | null; delayMin?: number; delayMax?: number
  restrito?: boolean; restritoAte?: string | null
}
export type Unidade = { id: string; nome: string }

const conectado = (s: string) => s === 'connected'

// Origens de atendimento exibidas como cards (além das instâncias de WhatsApp).
// O "Site" aqui é o FORMULÁRIO DE SAC do site: ele vira CHAMADO no SAC (canal='formulario'),
// que a atendente/consultora abre direto em Chamados — NÃO a caixa de leads do comercial.
// Reclame Aqui / Instagram / E-mail ficam OCULTOS por enquanto (pedido do Julio); reativar
// é só descomentar o item correspondente.
type Origem = { nome: string; icon: string; status: 'ativo' | 'breve'; desc: string; href?: string; cta?: string }
const ORIGENS: Origem[] = [
  { nome: 'Site', icon: 'ti-world', status: 'ativo', desc: 'O formulário de SAC do site vira chamado no SAC.', href: '/sac/chamados?canal=formulario', cta: 'Ver chamados' },
  { nome: 'Reclame Aqui', icon: 'ti-message-report', status: 'breve', desc: 'Integração em desenvolvimento.' },
  // { nome: 'Instagram', icon: 'ti-brand-instagram', status: 'breve', desc: 'Integração em desenvolvimento.' },
  // { nome: 'E-mail', icon: 'ti-mail', status: 'breve', desc: 'Integração em desenvolvimento.' },
]

export function CanaisManager({ canais, unidades, atendentes = [], isAdmin, activeUnitId, activeUnitName, central = false }: {
  canais: Canal[]; unidades: Unidade[]; atendentes?: { id: string; nome: string }[]; isAdmin: boolean; activeUnitId: string | null; activeUnitName: string
  // `central` = contexto do SAC: canal único da franqueadora, sem unidade/franquia (pedido do Julio).
  central?: boolean
}) {
  const router = useRouter()
  const [qr, setQr] = useState<{ nome: string; img?: string; status: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novo, setNovo] = useState(false)
  const [editar, setEditar] = useState<Canal | null>(null)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  async function abrirQr(nome: string) {
    setBusy(nome); setMsg('')
    const res = await conectarCanal(nome)
    setBusy(null)
    if (!res.ok || !res.state) { setMsg(res.error || 'Falha ao conectar.'); return }
    setQr({ nome, img: res.state.qrcode, status: res.state.status })
    if (poll.current) clearInterval(poll.current)
    poll.current = setInterval(async () => {
      const s = await statusCanal(nome)
      if (s.ok && s.state) {
        setQr((q) => (q ? { ...q, img: s.state!.qrcode ?? q.img, status: s.state!.status } : q))
        if (s.state.connected) {
          if (poll.current) clearInterval(poll.current); setQr(null)
          setMsg(`Canal "${nome}" conectado! Sincronizando mensagens…`)
          // auto-sincroniza o webhook ao conectar → garante que as mensagens caem na Triagem
          const sy = await sincronizarCanal(nome)
          setMsg(sy.ok ? `Canal "${nome}" conectado e sincronizado. ✅ As mensagens aparecem na Triagem em tempo real.` : `Canal "${nome}" conectado, mas a sincronização falhou: ${sy.error || ''}`)
          router.refresh()
        }
      }
    }, 4000)
  }
  function fecharQr() { if (poll.current) clearInterval(poll.current); setQr(null) }
  async function desconectar(nome: string) { if (!confirm(`Desconectar o canal "${nome}"?`)) return; setBusy(nome); await desconectarCanal(nome); setBusy(null); router.refresh() }
  async function excluir(nome: string) {
    if (!confirm(`Excluir o canal "${nome}"? O número é desconectado e o canal é removido de vez.`)) return
    setBusy(nome); const r = await excluirCanal(nome); setBusy(null)
    setMsg(r.ok ? `Canal "${nome}" excluído.` : (r.error || 'Falha ao excluir.')); router.refresh()
  }
  async function sincronizar(nome: string) {
    setBusy(nome); setMsg('')
    const r = await sincronizarCanal(nome)
    setBusy(null)
    setMsg(r.ok ? `Canal "${nome}" sincronizado — as mensagens vão cair na Triagem. ✅` : (r.error || 'Falha ao sincronizar.'))
  }

  function escopoBadge(c: Canal) {
    if (!c.vinculado) return <span style={pill('#FBE9EB', '#D85563')}>sem vínculo</span>
    if (central) {
      // SAC central: ou é o número central (fila), ou o número próprio de uma atendente (badge da linha de baixo).
      return c.atendenteId ? null : <span style={pill('#FBF3DF', '#9A7B12')}><i className="ti ti-broadcast" /> Central do SAC</span>
    }
    if (c.escopo === 'geral') return <span style={pill('#FBF3DF', '#9A7B12')}><i className="ti ti-broadcast" /> Geral</span>
    return <span style={pill('#EFE9F7', '#6b1f3a')}><i className="ti ti-building-store" /> {c.unidadeNome || 'Unidade'}</span>
  }

  return (
    <>
      <div className="rel-acts" style={{ justifyContent: 'space-between', margin: '4px 0 14px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--brand-600)' }}>{msg}</span>
        <button className="btn btn-primary" onClick={() => setNovo(true)}><i className="ti ti-plus" /> Novo canal</button>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '0 0 12px', lineHeight: 1.5 }}>
        {central
          ? <><i className="ti ti-info-circle" /> O SAC é <b>centralizado na franqueadora</b> (não há canal por franquia). Conecte o <b>WhatsApp central do SAC</b> via QR — tudo cai na <b>Conversa</b>. Cada atendente também pode conectar o <b>próprio número</b> aqui (cai só pra ela). O <b>formulário de SAC do site</b> vira <b>chamado</b> automaticamente.</>
          : <><i className="ti ti-info-circle" /> <b>Canais</b> são as origens dos atendimentos. Conecte o <b>WhatsApp</b> via QR (as mensagens caem na <b>Conversa</b>); o <b>formulário de SAC do site</b> vira <b>chamado</b> automaticamente.</>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 14 }}>
        {canais.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 13, gridColumn: '1 / -1' }}>WhatsApp ainda não conectado — clique em “Novo canal” e depois em “Conectar (QR)”.</div>}
        {canais.map((c) => (
          <div key={c.name} className="rel-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <i className="ti ti-brand-whatsapp" style={{ fontSize: 22, color: conectado(c.status) ? 'var(--green)' : 'var(--text-3)' }} />
              <b style={{ flex: 1, fontSize: 13.5 }}>{c.rotulo || c.name}</b>
              <span style={pill(conectado(c.status) ? '#E7F0EC' : '#FBE9EB', conectado(c.status) ? '#15803D' : '#D85563')}>{conectado(c.status) ? 'Conectado' : 'Desconectado'}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              {escopoBadge(c)}
              {c.atendenteNome && <span style={pill('#E7EEFB', '#1E3A8A')}><i className="ti ti-user" /> {c.atendenteNome}</span>}
              {c.vinculado && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>delay {c.delayMin}–{c.delayMax}s</span>}
            </div>
            {c.owner && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>{c.owner}</div>}
            {c.restrito && (
              <div style={{ fontSize: 11.5, background: '#FBF3DF', color: '#8a5a00', borderRadius: 8, padding: '7px 9px', marginBottom: 10, lineHeight: 1.4 }}>
                <b><i className="ti ti-alert-triangle" /> Restrição do WhatsApp{c.restritoAte ? ` até ${new Date(c.restritoAte).toLocaleDateString('pt-BR')}` : ''}.</b> Este número não pode <b>iniciar</b> conversas novas pelo sistema (anti-spam de número recém-ativado). <b>Responder</b> quem te escreve funciona. Pra iniciar, use um número já estabelecido ou aguarde liberar.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {conectado(c.status)
                ? <>
                    <button className="btn" disabled={busy === c.name} onClick={() => sincronizar(c.name)} title="Reaplica o webhook — garante que as mensagens recebidas apareçam na Triagem em tempo real"><i className="ti ti-refresh" /> Sincronizar</button>
                    <button className="btn" disabled={busy === c.name} onClick={() => desconectar(c.name)}><i className="ti ti-plug-off" /> Desconectar</button>
                  </>
                : <button className="btn btn-primary" disabled={busy === c.name} onClick={() => abrirQr(c.name)}>{busy === c.name ? '…' : <><i className="ti ti-qrcode" /> Conectar (QR)</>}</button>}
              <button className="btn" onClick={() => setEditar(c)}><i className="ti ti-settings" /> {c.vinculado ? 'Editar' : 'Vincular'}</button>
              <button className="btn" disabled={busy === c.name} onClick={() => excluir(c.name)} title="Excluir o canal de vez" style={{ color: 'var(--red)' }}><i className="ti ti-trash" /></button>
            </div>
          </div>
        ))}
        {/* Origens de leads (Site ativo + integrações futuras) — pedido do Julio: Canais = de onde vêm os leads. */}
        {ORIGENS.map((o) => (
          <div key={o.nome} className="rel-card" style={{ padding: 16, opacity: o.status === 'breve' ? 0.7 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <i className={`ti ${o.icon}`} style={{ fontSize: 22, color: o.status === 'ativo' ? 'var(--green)' : 'var(--text-3)' }} />
              <b style={{ flex: 1, fontSize: 13.5 }}>{o.nome}</b>
              <span style={pill(o.status === 'ativo' ? '#E7F0EC' : '#EEF1F4', o.status === 'ativo' ? '#15803D' : '#64748B')}>{o.status === 'ativo' ? 'Ativo' : 'Em breve'}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.4 }}>{o.desc}</div>
            {o.href && o.status === 'ativo'
              ? <button className="btn" onClick={() => router.push(o.href!)}><i className="ti ti-arrow-right" /> {o.cta ?? 'Ver leads'}</button>
              : <button className="btn" disabled style={{ opacity: 0.6 }}>Em breve</button>}
          </div>
        ))}
      </div>

      {(novo || editar) && (
        <CanalModal
          base={editar} isAdmin={isAdmin} unidades={unidades} atendentes={atendentes} activeUnitId={activeUnitId} activeUnitName={activeUnitName} central={central}
          onClose={() => { setNovo(false); setEditar(null) }}
          onSaved={(m) => { setNovo(false); setEditar(null); setMsg(m); router.refresh() }}
        />
      )}

      {qr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={fecharQr}>
          <div className="lc-card" style={{ background: '#fff', padding: 24, maxWidth: 360, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="lc-title" style={{ fontSize: 17, marginBottom: 4 }}>Conectar {qr.nome}</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 14 }}>Abra o WhatsApp → Aparelhos conectados → Conectar aparelho e escaneie:</p>
            {qr.img ? <img src={qr.img} alt="QR Code" style={{ width: 240, height: 240, margin: '0 auto', display: 'block' }} /> : <div style={{ padding: 40, color: 'var(--text-3)', fontSize: 13 }}>Gerando QR… ({qr.status})</div>}
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>Aguardando leitura… atualiza sozinho.</div>
            <button className="btn" style={{ marginTop: 14 }} onClick={fecharQr}>Fechar</button>
          </div>
        </div>
      )}
    </>
  )
}

function pill(bg: string, color: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color, display: 'inline-flex', alignItems: 'center', gap: 4 }
}

function CanalModal({ base, isAdmin, unidades, atendentes, activeUnitId, activeUnitName, central = false, onClose, onSaved }: {
  base: Canal | null; isAdmin: boolean; unidades: Unidade[]; atendentes: { id: string; nome: string }[]; activeUnitId: string | null; activeUnitName: string
  central?: boolean; onClose: () => void; onSaved: (msg: string) => void
}) {
  const editando = !!base // vincular/editar instância existente
  const [nome, setNome] = useState(base?.name ?? '')
  const [escopo, setEscopo] = useState<Escopo>(base?.escopo ?? 'unidade')
  const [unidadeId, setUnidadeId] = useState(base?.unidadeId ?? activeUnitId ?? unidades[0]?.id ?? '')
  const [rotulo, setRotulo] = useState(base?.rotulo ?? '')
  const [atendenteId, setAtendenteId] = useState(base?.atendenteId ?? '')
  // SAC central: o número é o "central do SAC" (fila) ou o "meu número pessoal" (cai só pra mim).
  const [meuNumero, setMeuNumero] = useState(!!base?.atendenteId)
  const [dMin, setDMin] = useState(String(base?.delayMin ?? 20))
  const [dMax, setDMax] = useState(String(base?.delayMax ?? 45))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function salvar() {
    setErr('')
    if (!editando && !nome.trim()) { setErr('Informe o nome do canal.'); return }
    if (!central && escopo === 'unidade' && isAdmin && !unidadeId) { setErr('Selecione a unidade.'); return }
    const min = Number(dMin), max = Number(dMax)
    if (!Number.isFinite(min) || min < 1) { setErr('Delay mínimo inválido (use ≥ 1 segundo).'); return }
    if (!Number.isFinite(max) || max < min) { setErr('O delay máximo deve ser maior ou igual ao mínimo.'); return }
    setBusy(true)
    // No SAC central: escopo é sempre franqueadora; quem decide o "dono" é o servidor (meuNumero → o próprio login).
    const form = central
      ? { nome: editando ? base!.name : nome, escopo: 'geral' as Escopo, unidadeId: '', rotulo, delayMin: min, delayMax: max, atendenteId: null, central: true, meuNumero }
      : { nome: editando ? base!.name : nome, escopo, unidadeId, rotulo, delayMin: min, delayMax: max, atendenteId: atendenteId || null }
    const res = editando ? await salvarVinculo({ ...form, id: base!.bindingId }) : await criarCanal(form)
    setBusy(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    onSaved(editando ? 'Canal salvo.' : 'Canal criado. Clique em "Conectar (QR)" para parear.')
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-head"><h3><i className="ti ti-brand-whatsapp" /> {editando ? `Canal: ${base!.name}` : 'Novo canal'}</h3><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          {!editando && <div className="mf"><label>Nome do canal</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={central ? "Ex.: SAC Central (será 'Laser - …')" : "Ex.: Suzano (será 'Laser - …')"} /></div>}
          <div className="mf"><label>Apelido (opcional)</label><input value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder={central ? 'Ex.: WhatsApp do SAC' : 'Ex.: WhatsApp Vendas Suzano'} /></div>

          {central ? (
            <div className="mf"><label>Tipo do número</label>
              <select value={meuNumero ? 'meu' : 'central'} onChange={(e) => setMeuNumero(e.target.value === 'meu')}>
                <option value="central">Central do SAC (vai pra fila / distribuição)</option>
                <option value="meu">Meu número pessoal (cai só pra mim)</option>
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                {meuNumero ? 'As conversas deste número caem direto pra você.' : 'Tudo deste número entra na fila central do SAC e é distribuído entre as atendentes online.'}
              </div>
            </div>
          ) : (
            <>
              <div className="mf"><label>Escopo</label>
                {isAdmin ? (
                  <select value={escopo} onChange={(e) => setEscopo(e.target.value as Escopo)}>
                    <option value="unidade">Unidade (número da franquia)</option>
                    <option value="geral">Geral (franqueadora)</option>
                  </select>
                ) : <input value={`Unidade  ${activeUnitName}`} disabled />}
              </div>
              {escopo === 'unidade' && isAdmin && (
                <div className="mf"><label>Unidade</label>
                  <select value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
                    <option value="">Selecione…</option>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
              )}
              <div className="mf"><label>Número de quem? (modelo híbrido)</label>
                <select value={atendenteId} onChange={(e) => setAtendenteId(e.target.value)}>
                  <option value="">Compartilhado da unidade (vai pra fila/distribuição)</option>
                  {atendentes.map((a) => <option key={a.id} value={a.id}>Número próprio de {a.nome} (cai só pra ela)</option>)}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Se for o WhatsApp pessoal de uma atendente, as conversas desse número caem direto pra ela.</div>
              </div>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Delay mín. (s)</label><input type="number" value={dMin} onChange={(e) => setDMin(e.target.value)} /></div>
            <div className="mf"><label>Delay máx. (s)</label><input type="number" value={dMax} onChange={(e) => setDMax(e.target.value)} /></div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>O delay (anti-ban) é aplicado aos disparos deste canal.</div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : (editando ? 'Salvar' : 'Criar canal')}</button></div>
      </div>
    </div>
  )
}
