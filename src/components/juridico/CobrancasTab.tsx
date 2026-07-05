'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { moedaBR } from '@/lib/fmt'
import { NOTIF_STATUS } from '@/lib/juridico'
import {
  sincronizarFinanceiro,
  salvarAjusteNotif,
  enviarNotif,
  descartarNotif,
} from '@/app/(app)/juridico/actions'

export type NotifRow = {
  id: string
  unidade_id: string | null
  fin_id: string | null
  unidade_nome: string
  franqueado: string | null
  cnpj: string | null
  categoria: string | null
  ref: string | null
  valor: number
  vencimento: string | null
  dias_atraso: number
  assunto: string
  corpo: string
  status: string // pendente | enviada
  enviada_em: string | null
  criado_em: string | null
}

/** KPIs reais (count/sum server-side), NÃO derivados do array .limit da lista. */
export type CobrancasKpis = {
  pendentes: number
  enviadas: number
  valorPendente: number
  unidadesAtraso: number
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-600)', flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
      </span>
      <span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
        <b style={{ fontSize: 20 }}>{value}</b>
      </span>
    </div>
  )
}

/** Card editável de uma notificação (jurCobrancas card 4947-4954). */
function NotifCard({ n }: { n: NotifRow }) {
  const router = useRouter()
  const pendente = n.status === 'pendente'
  const [assunto, setAssunto] = useState(n.assunto)
  const [corpo, setCorpo] = useState(n.corpo)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const badge = NOTIF_STATUS[n.status] ?? NOTIF_STATUS.pendente

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    setErro(null)
    const r = await fn()
    setBusy(false)
    if (!r.ok) setErro(r.error || 'Falha na operação.')
    else router.refresh()
  }

  async function onDescartar() {
    if (!confirm('Descartar esta notificação? O caso continua em aberto no Financeiro.')) return
    await run(() => descartarNotif(n.id))
  }

  return (
    <div className="rel-card" style={{ marginBottom: 12, borderLeft: `4px solid ${pendente ? 'var(--amber)' : 'var(--green)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 8, background: '#F7E7EB', color: 'var(--brand-600)' }}>
          <i className="ti ti-gavel" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{n.unidade_nome}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {n.franqueado}{n.cnpj ? ` · CNPJ ${n.cnpj}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, color: 'var(--red)' }}>{moedaBR(n.valor)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            {n.categoria}{n.ref ? ` · ${n.ref}` : ''} · {n.dias_atraso}d atraso
          </div>
        </div>
        <span className={`os-st ${badge.cls}`}>{badge.label}</span>
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="mf full" style={{ marginBottom: 8 }}>
          <label>Assunto</label>
          <input value={assunto} onChange={(e) => setAssunto(e.target.value)} disabled={!pendente || busy} />
        </div>
        <div className="mf full">
          <label>Notificação padrão (gerada automaticamente  ajuste se necessário)</label>
          <textarea
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={9}
            disabled={!pendente || busy}
            style={{ width: '100%', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 10, fontSize: 12.5, fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical' }}
          />
        </div>

        {erro && <div className="sim-msg err" style={{ marginTop: 8 }}><i className="ti ti-alert-triangle" /> {erro}</div>}

        {pendente ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => enviarNotif(n.id, assunto, corpo))}>
              <i className="ti ti-check" /> OK  Enviar notificação
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => salvarAjusteNotif(n.id, assunto, corpo))}>
              <i className="ti ti-device-floppy" /> Salvar ajuste
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={onDescartar}>
              <i className="ti ti-x" style={{ color: 'var(--red)' }} /> Descartar
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
            <i className="ti ti-mail-check" /> Enviada por e-mail ao franqueado{n.enviada_em ? ` em ${new Date(n.enviada_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}.
          </div>
        )}
      </div>
    </div>
  )
}

export function CobrancasTab({ notificacoes, kpis, migrationPendente }: { notificacoes: NotifRow[]; kpis: CobrancasKpis; migrationPendente: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Listas exibidas (capadas a 500 pela página)  apenas para renderizar os cards.
  const pend = useMemo(() => notificacoes.filter((n) => n.status === 'pendente'), [notificacoes])
  const enviadas = useMemo(() => notificacoes.filter((n) => n.status === 'enviada'), [notificacoes])

  async function onSync() {
    setBusy(true)
    setErro(null)
    setMsg(null)
    const r = await sincronizarFinanceiro()
    setBusy(false)
    if (!r.ok) { setErro(r.error || 'Falha ao sincronizar.'); return }
    setMsg(r.criadas ? `${r.criadas} nova(s) cobrança(s) importada(s) do Financeiro` : 'Tudo sincronizado com o Financeiro')
    router.refresh()
  }

  return (
    <div>
      <div className="rel-legend">
        Integrado ao <b>recebimento do Financeiro Franqueadora</b>: toda unidade que <b>atrasa um pagamento</b> entra
        aqui automaticamente, com a <b>notificação padrão já montada</b> a partir dos dados da unidade (valor, natureza
        do débito, vencimento e dias em atraso). Revise, ajuste se quiser e clique em <b>OK  Enviar</b>.
      </div>

      {/* 4 KPIs (jurCobrancas 4956)  totais REAIS (count/sum server-side), não derivados da lista capada. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        <Kpi label="Notificações pendentes" value={String(kpis.pendentes)} icon="ti-bell" />
        <Kpi label="Valor em cobrança" value={moedaBR(kpis.valorPendente)} icon="ti-cash" />
        <Kpi label="Já enviadas" value={String(kpis.enviadas)} icon="ti-mail-check" />
        <Kpi label="Unidades em atraso" value={String(kpis.unidadesAtraso)} icon="ti-building-store" />
      </div>

      <div className="rel-acts" style={{ margin: '0 0 14px' }}>
        <button className="btn btn-ghost" disabled={busy || migrationPendente} onClick={onSync}>
          <i className="ti ti-refresh" /> Sincronizar com o Financeiro
        </button>
      </div>

      {msg && <div className="sim-msg ok" style={{ marginBottom: 10 }}><i className="ti ti-check" /> {msg}</div>}
      {erro && <div className="sim-msg err" style={{ marginBottom: 10 }}><i className="ti ti-alert-triangle" /> {erro}</div>}

      {kpis.pendentes ? (
        <>
          <div className="set-sec" style={{ marginTop: 4 }}>
            Pendentes de envio
            {pend.length < kpis.pendentes && (
              <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>
                mostrando {pend.length} de {kpis.pendentes}
              </span>
            )}
          </div>
          {pend.map((n) => <NotifCard key={n.id} n={n} />)}
        </>
      ) : (
        <div className="sim-msg ok"><i className="ti ti-check" /> Nenhuma cobrança pendente no Jurídico.</div>
      )}

      {kpis.enviadas > 0 && (
        <>
          <div className="set-sec">
            Notificações enviadas
            {enviadas.length < kpis.enviadas && (
              <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>
                mostrando {enviadas.length} de {kpis.enviadas}
              </span>
            )}
          </div>
          {enviadas.map((n) => <NotifCard key={n.id} n={n} />)}
        </>
      )}
    </div>
  )
}
