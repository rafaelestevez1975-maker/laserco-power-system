'use client'

import { useEffect, useState } from 'react'
import {
  APP, APP_NEXT, APP_PKGS, APP_SERV, APP_UNITS, APP_REDEEM, APP_TABS,
  APP_HISTORICO, APP_PROFISSIONAIS, APP_DATAS, APP_HORARIOS, APP_FEATS,
  REGRAS_PONTOS, type AppPkg,
} from '@/lib/app-cliente'

/**
 * App do Cliente (mockup interativo) — paridade com buildAppCliente/appRender do
 * legado (legacy/index.html ~4711-4825). Tab bar de 5 abas navegáveis + telas
 * Início, Agendar, Serviços, Sessões, Fidelidade, Unidades e fluxo Indique&Ganhe.
 * Protótipo: as ações mostram feedback inline (sem persistência).
 */

type Friend = { nome: string; telefone: string; unidade: string }

export function AppClienteMockup() {
  const [scr, setScr] = useState('home')
  const [clock, setClock] = useState('09:41')
  // toast inline simples (substitui o showToast do legado)
  const [toast, setToast] = useState('')

  // Relógio dinâmico (legado appClock L4717).
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  // Toast some sozinho.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(id)
  }, [toast])

  function go(s: string) { setScr(s) }

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri"><i className="ti ti-device-mobile" /></div>
        <div>
          <h2>App do Cliente · Laser&amp;Co</h2>
          <p>Protótipo do aplicativo (Android e iOS) entregue ao cliente · espelha o sistema</p>
        </div>
      </div>

      <div className="app-stage">
        <div className="phone">
          <div className="phone-notch" />
          <div className="phone-status">
            <span>{clock}</span>
            <span><i className="ti ti-signal-4g" /> <i className="ti ti-wifi" /> <i className="ti ti-battery-3" /></span>
          </div>
          <div className="phone-screen">
            {toast && (
              <div style={{ position: 'sticky', top: 0, zIndex: 5, margin: '8px 10px 0', padding: '8px 11px', background: 'var(--brand-500)', color: '#fff', borderRadius: 9, fontSize: 12, fontWeight: 600, boxShadow: '0 6px 18px rgba(0,0,0,.18)' }}>
                <i className="ti ti-check" /> {toast}
              </div>
            )}
            <Screen scr={scr} go={go} toast={setToast} />
          </div>
          <div className="phone-tabbar">
            {APP_TABS.map((t) => (
              <div
                key={t.k}
                className={`app-tab ${t.k === scr ? 'on' : ''}`}
                onClick={() => go(t.k)}
                role="button"
                tabIndex={0}
              >
                <i className={`ti ${t.icon}`} />{t.label}
              </div>
            ))}
          </div>
        </div>

        <div className="app-side">
          <div className="rel-card">
            <div className="set-sec">Sobre o app</div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
              Aplicativo nativo (Android e iOS) para o cliente da rede. Espelha o sistema: agenda, serviços, sessões
              contratadas e realizadas, unidades, clube de fidelidade e o novo <b>Indique &amp; Ganhe</b>.
            </p>
            <div className="app-feats">
              {APP_FEATS.map((f) => (
                <div key={f} className="app-feat"><i className="ti ti-circle-check" /><span>{f}</span></div>
              ))}
            </div>
          </div>
          <div className="rel-card">
            <div className="set-sec">Publicação nas lojas</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="store-badge"><i className="ti ti-brand-google-play" /><div><small>Disponível no</small><b>Google Play</b></div></div>
              <div className="store-badge"><i className="ti ti-brand-apple" /><div><small>Baixar na</small><b>App Store</b></div></div>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 12 }}>
              Tecnologia sugerida: app híbrido (React Native / Flutter) consumindo a mesma API do sistema, com login pelo telefone do cliente.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── Telas ─────────────────────────────

function Screen({ scr, go, toast }: { scr: string; go: (s: string) => void; toast: (m: string) => void }) {
  if (scr === 'home') return <ScrHome go={go} toast={toast} />
  if (scr === 'agendar') return <ScrAgendar toast={toast} />
  if (scr === 'servicos') return <ScrServicos go={go} />
  if (scr === 'sessoes') return <ScrSessoes />
  if (scr === 'fidelidade') return <ScrFidelidade go={go} toast={toast} />
  if (scr === 'unidades') return <ScrUnidades go={go} toast={toast} />
  if (scr === 'indicar') return <ScrIndicar toast={toast} />
  return null
}

function PkgCard({ pk }: { pk: AppPkg }) {
  const pc = Math.round((pk.done / pk.total) * 100)
  return (
    <div className="app-card">
      <div className="app-row">
        <div className="app-ic g"><i className="ti ti-box" /></div>
        <div style={{ flex: 1 }}>
          <div className="app-tt">{pk.serv}</div>
          <div className="app-st">{pk.done} de {pk.total} sessões realizadas · restam {pk.total - pk.done}</div>
        </div>
        <span className="app-pill b">{pc}%</span>
      </div>
      <div className="app-prog"><span style={{ width: `${pc}%` }} /></div>
    </div>
  )
}

function ScrHome({ go, toast }: { go: (s: string) => void; toast: (m: string) => void }) {
  return (
    <div className="ascr">
      <div className="app-hero">
        <h3>Olá, {APP.nome} 👋</h3>
        <p>Bem-vinda de volta à Laser&amp;Co</p>
        <div className="app-pts">
          <i className="ti ti-coin" style={{ fontSize: 22, color: 'var(--gold-400)' }} />
          <div>
            <div className="v">{APP.pts.toLocaleString('pt-BR')} pts</div>
            <div style={{ fontSize: 10.5, opacity: 0.9 }}>Clube {APP.nivel}</div>
          </div>
          <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => go('fidelidade')} />
        </div>
      </div>
      <div className="app-sec-t">Próximo agendamento</div>
      <div className="app-card">
        <div className="app-row">
          <div className="app-ic"><i className="ti ti-calendar-event" /></div>
          <div style={{ flex: 1 }}>
            <div className="app-tt">{APP_NEXT.serv}</div>
            <div className="app-st">{APP_NEXT.data} · {APP_NEXT.prof}</div>
            <div className="app-st">{APP_NEXT.unid}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
          <button className="app-btn ghost" style={{ marginTop: 0, flex: 1, padding: 9 }} onClick={() => toast('Reagendamento solicitado')}>Reagendar</button>
          <button className="app-btn" style={{ marginTop: 0, flex: 1, padding: 9 }} onClick={() => toast('Confirmado! Até lá 💜')}>Confirmar</button>
        </div>
      </div>
      <div className="app-quick">
        <div className="app-q" onClick={() => go('agendar')}><i className="ti ti-calendar-plus" /><span>Agendar</span></div>
        <div className="app-q" onClick={() => go('servicos')}><i className="ti ti-sparkles" /><span>Serviços</span></div>
        <div className="app-q" onClick={() => go('sessoes')}><i className="ti ti-checkup-list" /><span>Sessões</span></div>
        <div className="app-q" onClick={() => go('unidades')}><i className="ti ti-map-pin" /><span>Unidades</span></div>
      </div>
      <div className="app-banner" onClick={() => go('indicar')}>
        <h4><i className="ti ti-gift" /> Indique &amp; Ganhe</h4>
        <p>Indique 5 amigos, ganhe <b>50 pts</b> por indicação e concorra a um <b>pacote de laser todo mês</b>!</p>
      </div>
      <div className="app-sec-t">Meus pacotes <a onClick={() => go('sessoes')} style={{ cursor: 'pointer' }}>ver todos</a></div>
      {APP_PKGS.slice(0, 2).map((pk) => <PkgCard key={pk.serv} pk={pk} />)}
    </div>
  )
}

function ScrAgendar({ toast }: { toast: (m: string) => void }) {
  const [data, setData] = useState(1)
  const [hora, setHora] = useState(3)
  return (
    <div className="ascr">
      <div className="app-sec-t" style={{ marginTop: 4 }}>Agendar sessão</div>
      <div className="app-field"><label>Unidade</label><select>{APP_UNITS.map((u) => <option key={u.n}>{u.n}</option>)}</select></div>
      <div className="app-field"><label>Serviço</label><select>{APP_SERV.map((s) => <option key={s.n}>{s.n}</option>)}</select></div>
      <div className="app-field"><label>Profissional</label><select>{APP_PROFISSIONAIS.map((p) => <option key={p}>{p}</option>)}</select></div>
      <div className="app-field"><label>Data</label><div>{APP_DATAS.map((d, i) => (
        <span key={d} className={`app-chip ${i === data ? 'on' : ''}`} onClick={() => setData(i)}>{d}</span>
      ))}</div></div>
      <div className="app-field"><label>Horário</label><div>{APP_HORARIOS.map((t, i) => (
        <span key={t} className={`app-chip ${i === hora ? 'on' : ''}`} onClick={() => setHora(i)}>{t}</span>
      ))}</div></div>
      <button className="app-btn" onClick={() => toast('Sessão agendada! Você receberá a confirmação no app 💜')}>Confirmar agendamento</button>
    </div>
  )
}

function ScrServicos({ go }: { go: (s: string) => void }) {
  return (
    <div className="ascr">
      <div className="app-sec-t" style={{ marginTop: 4 }}>Serviços <a onClick={() => go('home')} style={{ cursor: 'pointer' }}>início</a></div>
      {APP_SERV.map((s) => (
        <div key={s.n} className="app-card">
          <div className="app-row">
            <div className="app-ic g"><i className={`ti ${s.ic}`} /></div>
            <div style={{ flex: 1 }}><div className="app-tt">{s.n}</div><div className="app-st">{s.d}</div></div>
            <div style={{ textAlign: 'right' }}><b style={{ fontSize: 13, color: 'var(--brand-500)' }}>{s.p}</b></div>
          </div>
          <button className="app-btn ghost" style={{ padding: 8, marginTop: 10 }} onClick={() => go('agendar')}>Agendar</button>
        </div>
      ))}
    </div>
  )
}

function ScrSessoes() {
  const done = APP_PKGS.reduce((a, p) => a + p.done, 0)
  const total = APP_PKGS.reduce((a, p) => a + p.total, 0)
  return (
    <div className="ascr">
      <div className="app-sec-t" style={{ marginTop: 4 }}>Minhas sessões</div>
      <div className="app-card" style={{ background: 'linear-gradient(135deg,#EFE9F7,#F6EACB)', border: 'none' }}>
        <div className="app-row">
          <div className="app-ic"><i className="ti ti-checkup-list" /></div>
          <div>
            <div className="app-tt">{done} de {total} sessões realizadas</div>
            <div className="app-st">somando todos os pacotes contratados</div>
          </div>
        </div>
      </div>
      {APP_PKGS.map((pk) => <PkgCard key={pk.serv} pk={pk} />)}
      <div className="app-sec-t">Histórico recente</div>
      {APP_HISTORICO.map(([nome, info]) => (
        <div key={nome} className="app-card">
          <div className="app-row">
            <div className="app-ic"><i className="ti ti-circle-check" /></div>
            <div style={{ flex: 1 }}><div className="app-tt">{nome}</div><div className="app-st">{info}</div></div>
            <span className="app-pill">Realizada</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ScrFidelidade({ go, toast }: { go: (s: string) => void; toast: (m: string) => void }) {
  return (
    <div className="ascr">
      <div className="app-hero" style={{ background: 'linear-gradient(135deg,var(--gold-600),var(--gold-400))' }}>
        <h3 style={{ color: '#3A2A06' }}>Clube {APP.nivel}</h3>
        <p style={{ color: '#5A4310' }}>Seu saldo de pontos</p>
        <div className="app-pts" style={{ background: 'rgba(255,255,255,.3)' }}>
          <i className="ti ti-coin" style={{ fontSize: 22, color: '#7A5A12' }} />
          <div>
            <div className="v" style={{ color: '#3A2A06' }}>{APP.pts.toLocaleString('pt-BR')} pts</div>
            <div style={{ fontSize: 10.5, color: '#5A4310' }}>vence em 12/2026</div>
          </div>
        </div>
      </div>
      <div className="app-card" style={{ background: 'linear-gradient(135deg,#1F9D6B,#34b67e)', border: 'none', color: '#fff' }}>
        <div className="app-row">
          <div className="app-ic" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}><i className="ti ti-cash" /></div>
          <div style={{ flex: 1 }}>
            <div className="app-tt" style={{ color: '#fff' }}>Cashback disponível</div>
            <div className="app-st" style={{ color: 'rgba(255,255,255,.85)' }}>crédito em dinheiro para outras compras</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Playfair Display',serif" }}>R$ {APP.cash}</div>
        </div>
      </div>
      <div className="app-card">
        <div className="regra-h" style={{ color: 'var(--brand-500)', marginBottom: 8, fontSize: 12.5 }}><i className="ti ti-info-circle" /> Como você ganha</div>
        <div className="app-feat"><i className="ti ti-coin" style={{ color: 'var(--gold-600)' }} /><span><b>R$ {REGRAS_PONTOS.pontoPorReal} gasto = 1 ponto.</b> Pontos viram serviços e produtos no Clube ({REGRAS_PONTOS.pontosPorReal10} pts ≈ R$ 10). Validade {REGRAS_PONTOS.validadePontosMeses} meses.</span></div>
        <div className="app-feat" style={{ marginTop: 8 }}><i className="ti ti-cash" style={{ color: 'var(--green)' }} /><span><b>Cashback {APP.cashPct}% (nível {APP.nivel}).</b> Parte de cada compra volta como crédito em dinheiro para outras compras. Bronze {REGRAS_PONTOS.cashback.Bronze}% · Prata {REGRAS_PONTOS.cashback.Prata}% · Ouro {REGRAS_PONTOS.cashback.Ouro}%. Validade {REGRAS_PONTOS.validadeCashbackMeses} meses.</span></div>
      </div>
      <div className="app-banner" onClick={() => go('indicar')}>
        <h4><i className="ti ti-gift" /> Indique &amp; Ganhe</h4>
        <p>{REGRAS_PONTOS.ptsPorIndicacao} pts por amigo indicado + sorteio de um pacote de laser todo mês.</p>
      </div>
      <div className="app-sec-t">Resgate com seus pontos</div>
      {APP_REDEEM.map((r) => (
        <div key={r.n} className="app-redeem">
          <div className={`app-ic ${r.p <= APP.pts ? 'g' : ''}`}><i className={`ti ${r.ic}`} /></div>
          <div style={{ flex: 1 }}>
            <div className="app-tt">{r.n}</div>
            <div className="app-st">{r.p <= APP.pts ? 'Disponível para resgate' : `Faltam ${r.p - APP.pts} pts`}</div>
          </div>
          <div className="cost"><b>{r.p}</b><div style={{ fontSize: 9.5, color: 'var(--text-3)' }}>pts</div></div>
        </div>
      ))}
      <button className="app-btn gold" onClick={() => toast('Resgate solicitado! A unidade confirmará no app 🎁')}>Resgatar selecionado</button>
    </div>
  )
}

function ScrUnidades({ go, toast }: { go: (s: string) => void; toast: (m: string) => void }) {
  return (
    <div className="ascr">
      <div className="app-sec-t" style={{ marginTop: 4 }}>Nossas unidades</div>
      {APP_UNITS.map((u) => (
        <div key={u.n} className="app-card">
          <div className="app-row">
            <div className="app-ic"><i className="ti ti-building-store" /></div>
            <div style={{ flex: 1 }}>
              <div className="app-tt">{u.n}</div>
              <div className="app-st">{u.e}</div>
              <div className="app-st"><i className="ti ti-phone" style={{ fontSize: 11 }} /> {u.t}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="app-btn ghost" style={{ padding: 8, marginTop: 0, flex: 1 }} onClick={() => toast('Abrindo no mapa…')}><i className="ti ti-map-2" /> Rotas</button>
            <button className="app-btn" style={{ padding: 8, marginTop: 0, flex: 1 }} onClick={() => go('agendar')}>Agendar aqui</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ScrIndicar({ toast }: { toast: (m: string) => void }) {
  const [friends, setFriends] = useState<Friend[]>([{ nome: '', telefone: '', unidade: APP_UNITS[0].n }])
  const [enviados, setEnviados] = useState<{ list: Friend[]; pts: number; unidades: string[] } | null>(null)

  function add() {
    if (friends.length >= REGRAS_PONTOS.maxAmigos) { toast(`Máximo de ${REGRAS_PONTOS.maxAmigos} indicações por vez`); return }
    setFriends((f) => [...f, { nome: '', telefone: '', unidade: APP_UNITS[0].n }])
  }
  function patch(i: number, key: keyof Friend, val: string) {
    setFriends((f) => f.map((x, idx) => (idx === i ? { ...x, [key]: val } : x)))
  }
  function enviar() {
    const validos = friends.filter((f) => f.nome.trim())
    if (!validos.length) { toast('Preencha ao menos um amigo'); return }
    const lista = validos.slice(0, REGRAS_PONTOS.maxAmigos)
    const pts = REGRAS_PONTOS.ptsPorIndicacao * lista.length
    const unidades = [...new Set(lista.map((f) => f.unidade))]
    setEnviados({ list: lista, pts, unidades })
    toast(`Indicações enviadas por e-mail à unidade · +${pts} pts 🎉`)
  }

  return (
    <div className="ascr">
      <div className="app-banner" style={{ textAlign: 'center' }}>
        <h4 style={{ justifyContent: 'center' }}><i className="ti ti-gift" /> Indique &amp; Ganhe</h4>
        <p>Ganhe <b>50 pontos</b> por amigo que se cadastrar e <b>concorra a um pacote de laser todo mês</b>. Indique até 5 amigos!</p>
      </div>
      <div className="app-card" style={{ background: '#EFE9F7', border: 'none' }}>
        <div className="app-st" style={{ color: 'var(--brand-600)' }}>Indicado por</div>
        <div className="app-tt">{APP.nomeCompleto} · Clube {APP.nivel}</div>
      </div>
      <div className="app-sec-t">Seus amigos <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{friends.length}/{REGRAS_PONTOS.maxAmigos}</span></div>
      {friends.map((f, i) => (
        <div key={i} className="app-friend">
          <div className="app-field" style={{ gridColumn: '1/-1', marginBottom: 0 }}>
            <label>Nome do amigo</label>
            <input value={f.nome} placeholder="Nome completo" onChange={(e) => patch(i, 'nome', e.target.value)} />
          </div>
          <div className="app-field" style={{ marginBottom: 0 }}>
            <label>Telefone</label>
            <input value={f.telefone} placeholder="(00) 00000-0000" onChange={(e) => patch(i, 'telefone', e.target.value)} />
          </div>
          <div className="app-field" style={{ marginBottom: 0 }}>
            <label>Unidade</label>
            <select value={f.unidade} onChange={(e) => patch(i, 'unidade', e.target.value)}>{APP_UNITS.map((u) => <option key={u.n}>{u.n}</option>)}</select>
          </div>
        </div>
      ))}
      <button className="app-btn ghost" style={{ marginBottom: 8 }} onClick={add}><i className="ti ti-plus" /> Adicionar amigo</button>
      {enviados && (
        <div>
          <div className="app-card" style={{ borderColor: 'var(--green)' }}>
            <div className="app-row">
              <div className="app-ic" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}><i className="ti ti-mail-check" /></div>
              <div>
                <div className="app-tt">Indicações enviadas! +{enviados.pts} pts</div>
                <div className="app-st">E-mail enviado à(s) unidade(s): {enviados.unidades.join(', ')}</div>
              </div>
            </div>
          </div>
          {enviados.list.map((f, i) => (
            <div key={i} className="app-card">
              <div className="app-row">
                <div className="app-ic"><i className="ti ti-user" /></div>
                <div style={{ flex: 1 }}>
                  <div className="app-tt">{f.nome}</div>
                  <div className="app-st">{f.telefone || 'sem telefone'} · {f.unidade}</div>
                </div>
                <span className="app-pill">+50 pts</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="app-btn gold" onClick={enviar}><i className="ti ti-send" /> Enviar indicações</button>
      <p style={{ fontSize: 10.5, color: 'var(--text-3)', textAlign: 'center', marginTop: 9 }}>
        As indicações são enviadas por e-mail à unidade escolhida. Você ganha os pontos quando o amigo realiza a 1ª avaliação.
      </p>
    </div>
  )
}
