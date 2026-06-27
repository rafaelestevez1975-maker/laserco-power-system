'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { dataHora } from '@/lib/fmt'
import { pontoMapSrc, type PontoConfig as ConfigPontoT } from '@/lib/rh'
import {
  registrarPonto,
  criarAjustePonto,
  editarPonto,
  salvarPontoConfig,
  PONTO_TIPOS,
  type AjustePontoInput,
} from '@/app/(app)/ponto/actions'

export type ColabOpt = { id: string; nome: string | null; cargo: string | null; unidade_id: string | null }
export type ConfigPonto = ConfigPontoT

export type RegistroRow = {
  id: string
  colaborador_id: string | null
  unidade_id: string | null
  tipo: string | null
  data_hora: string | null
  lat: number | null
  lng: number | null
  distancia_m?: number | null
  modo?: string | null
  validado_geo: boolean | null
  fonte: string | null
  ajustado_por: string | null
  motivo_ajuste: string | null
  colaborador_nome?: string
}

type Props = {
  rows: RegistroRow[]
  colaboradores: ColabOpt[]
  podeGerir: boolean
  meuColabId: string | null
  isAdmin: boolean
  activeUnitId: string | null
  activeUnitName: string
  config: ConfigPonto
  semMigration: boolean
  filtros: { colaborador: string; tipo: string; validacao: string; di: string; df: string }
  kpis: { marcacoesHoje: number; presentesHoje: number; noLocal: number; foraDoLocal: number }
  page: number
  totalPages: number
  total: number
}

const CASA_KEY = 'lc_ponto_casa' // GPS da casa (home office) — por dispositivo (legado casaLat/casaLng)
function lerCasa(): { lat: number; lng: number } | null {
  if (typeof localStorage === 'undefined') return null
  try { const v = JSON.parse(localStorage.getItem(CASA_KEY) || 'null'); return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null } catch { return null }
}
function salvarCasa(lat: number, lng: number) { try { localStorage.setItem(CASA_KEY, JSON.stringify({ lat, lng })) } catch { /* ignore */ } }

const TIPO_LABEL: Record<string, string> = Object.fromEntries(PONTO_TIPOS.map((t) => [t.k, t.l]))
const TIPO_ICON: Record<string, string> = Object.fromEntries(PONTO_TIPOS.map((t) => [t.k, t.ic]))
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }

export function PontoManager(props: Props) {
  const { rows, colaboradores, podeGerir, meuColabId, isAdmin, activeUnitId, activeUnitName, config, semMigration, filtros, kpis, page, totalPages, total } = props
  const router = useRouter()

  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [marcando, setMarcando] = useState<string | null>(null)
  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<RegistroRow | null>(null)

  // Modo presencial (unidade) x home office (casa) — legado pontoSetModo (index.html ~8431).
  const [modo, setModo] = useState<'unidade' | 'casa'>(config.modo_padrao === 'casa' ? 'casa' : 'unidade')
  const [casa, setCasa] = useState<{ lat: number; lng: number } | null>(() => (typeof window !== 'undefined' ? lerCasa() : null))
  const [capturandoCasa, setCapturandoCasa] = useState(false)
  // Última coordenada marcada (centra o mapa, como no legado).
  const ultimaRow = rows[0]
  const [ultima, setUltima] = useState<{ lat: number; lng: number } | null>(
    ultimaRow?.lat != null && ultimaRow?.lng != null ? { lat: ultimaRow.lat, lng: ultimaRow.lng } : null,
  )

  const temFiltro = !!(filtros.colaborador || filtros.tipo || filtros.validacao || filtros.di || filtros.df)
  const podeMarcar = !!meuColabId
  const casaDef = !!casa
  const baseLat = modo === 'casa' && casa ? casa.lat : config.uni_lat
  const baseLng = modo === 'casa' && casa ? casa.lng : config.uni_lng
  const mapLat = ultima?.lat ?? baseLat
  const mapLng = ultima?.lng ?? baseLng

  // ── Definir/atualizar o GPS da minha casa (home office) — legado pontoDefinirCasa (~8432). ──
  function definirCasa() {
    setMsg(''); setErro('')
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setErro('GPS indisponível neste dispositivo.'); return }
    setCapturandoCasa(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        salvarCasa(c.lat, c.lng); setCasa(c); setUltima(c); setCapturandoCasa(false)
        setMsg('Endereço de casa definido para home office.')
      },
      () => { setCapturandoCasa(false); setErro('Não foi possível obter o GPS da sua casa.') },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // ── Bater o próprio ponto (captura GPS; servidor calcula a cerca virtual Haversine) ──
  function marcar(tipo: string) {
    setMsg(''); setErro('')
    // Home office sem casa definida → bloqueia (legado: "Defina o endereço de casa…").
    if (modo === 'casa' && !casaDef) { setErro('Defina o endereço de casa (home office) antes de bater o ponto.'); return }
    setMarcando(tipo)

    const enviar = (lat: number | null, lng: number | null) => {
      registrarPonto({
        tipo, lat, lng, unidade_id: activeUnitId, modo,
        casa_lat: casa?.lat ?? null, casa_lng: casa?.lng ?? null,
      })
        .then((r) => {
          setMarcando(null)
          if (!r.ok) { setErro(r.error || 'Erro ao registrar o ponto.'); return }
          if (lat != null && lng != null) setUltima({ lat, lng })
          const local = modo === 'casa' ? 'Casa (home office)' : activeUnitName
          setMsg(
            lat == null
              ? `${TIPO_LABEL[tipo] ?? 'Ponto'} registrado (sem GPS).`
              : r.validado
                ? `Ponto registrado no local (${local}).`
                : `Ponto registrado FORA do raio permitido${r.distancia != null ? ` (${r.distancia} m)` : ''}.`,
          )
          router.refresh()
        })
        .catch(() => { setMarcando(null); setErro('Falha de comunicação ao registrar.') })
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => enviar(pos.coords.latitude, pos.coords.longitude),
        () => enviar(null, null), // sem permissão/erro → registra sem GPS
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      )
    } else {
      enviar(null, null)
    }
  }

  // ── URLs preservando filtros ──
  function urlCom(extra: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams()
    if (filtros.colaborador) p.set('colaborador', filtros.colaborador)
    if (filtros.tipo) p.set('tipo', filtros.tipo)
    if (filtros.validacao) p.set('validacao', filtros.validacao)
    if (filtros.di) p.set('di', filtros.di)
    if (filtros.df) p.set('df', filtros.df)
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === '' || v === null) p.delete(k)
      else p.set(k, String(v))
    }
    const s = p.toString()
    return `/ponto${s ? `?${s}` : ''}`
  }
  const urlPagina = (pg: number) => urlCom({ page: pg > 1 ? pg : undefined })

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-map-pin-check" /> Ponto Digital por geolocalização (GPS) ·{' '}
        <b>{activeUnitName}</b>
        {podeGerir
          ? ' — você vê o espelho de ponto da unidade e pode ajustar marcações.'
          : ' — registre o seu ponto pelos botões e acompanhe o seu espelho.'}
      </div>

      {semMigration && (
        <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', padding: '10px 14px', background: '#FFF7E6', border: '1px solid #F0D89A' }}>
          <i className="ti ti-database-off" style={{ color: 'var(--amber)', fontSize: 18, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            Tabela de ponto sem as colunas de cerca virtual. Aplique a migration <b>scripts/migrations/rh.sql</b> no lkii para a validação por distância e a configuração admin funcionarem.
          </span>
        </div>
      )}

      <div className="rel-legend" style={{ marginBottom: 12 }}>
        Registre o ponto com a sua <b>localização atual (GPS)</b>. O sistema valida se você está dentro da <b>cerca virtual</b> (raio de {config.raio} m) da <b>unidade</b> — ou, em <b>home office</b>, do seu <b>endereço de casa</b>. Cada colaborador vê o <b>seu próprio</b> ponto.
      </div>

      {/* ── Bater meu ponto ── */}
      <div className="lc-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <b style={{ fontSize: 14 }}>
            <i className="ti ti-clock-hour-4" style={{ color: 'var(--brand-500)' }} /> Meu ponto · {modo === 'casa' ? 'Casa (home office)' : activeUnitName}
          </b>
          <span style={pill(config.maps_key ? '#E7F0EC' : '#FBEFD9', config.maps_key ? '#15803D' : '#9A6700')}>
            {config.maps_key ? 'Google Maps conectado' : 'Sem chave — usando OpenStreetMap'}
          </span>
        </div>

        {/* Toggle presencial x home office (legado seg, index.html ~8470) */}
        <div className="seg" style={{ margin: '4px 0 10px' }}>
          <button className={`seg-btn ${modo !== 'casa' ? 'active' : ''}`} onClick={() => setModo('unidade')}>
            <i className="ti ti-building-store" /> Presencial (unidade)
          </button>
          <button className={`seg-btn ${modo === 'casa' ? 'active' : ''}`} onClick={() => setModo('casa')}>
            <i className="ti ti-home" /> Home office (casa)
          </button>
        </div>

        {/* Bloco home office: definir/atualizar GPS da casa + aviso/bloqueio (legado ~8471) */}
        {modo === 'casa' && (
          <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 9px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <i className="ti ti-home" />
            {casaDef
              ? <span>Endereço de casa definido — valida no raio de {config.raio} m da sua casa.</span>
              : <b style={{ color: '#B26A00' }}>Defina seu endereço de casa para validar o ponto home office.</b>}
            <button className="btn btn-ghost" style={{ padding: '5px 9px' }} disabled={capturandoCasa} onClick={definirCasa}>
              <i className="ti ti-current-location" /> {capturandoCasa ? 'Capturando…' : casaDef ? 'Atualizar minha casa (GPS)' : 'Definir minha casa (GPS)'}
            </button>
          </div>
        )}

        {!podeMarcar && (
          <div style={{ fontSize: 12.5, color: '#9A6700', background: '#FBEFD9', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
            <i className="ti ti-alert-triangle" /> Seu usuário não está vinculado a um colaborador de RH, então não é possível bater o seu ponto. Fale com o gestor.
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {PONTO_TIPOS.map((t) => (
            <button
              key={t.k}
              className="btn btn-primary"
              style={{ flex: 1, minWidth: 150, justifyContent: 'center' }}
              disabled={!podeMarcar || marcando !== null || (modo === 'casa' && !casaDef)}
              onClick={() => marcar(t.k)}
            >
              <i className={`ti ${t.ic}`} /> {marcando === t.k ? 'Registrando…' : t.l}
            </button>
          ))}
        </div>
      </div>

      {(msg || erro) && (
        <div
          style={{
            fontSize: 12.5, margin: '0 0 12px', padding: '8px 12px', borderRadius: 8,
            background: erro ? 'var(--red-bg)' : '#E7F0EC', color: erro ? 'var(--red)' : '#15803D',
          }}
        >
          {erro || msg}
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        <div className="metric-box"><span>Marcações hoje</span><b>{kpis.marcacoesHoje}</b></div>
        <div className="metric-box"><span>Presentes hoje</span><b style={{ color: 'var(--brand-600)' }}>{kpis.presentesHoje}</b></div>
        <div className="metric-box"><span>No local (GPS ok)</span><b style={{ color: '#15803D' }}>{kpis.noLocal}</b></div>
        <div className="metric-box"><span>Fora do local</span><b style={{ color: '#D85563' }}>{kpis.foraDoLocal}</b></div>
      </div>

      {/* ── Mapa da marcação + Configuração (admin) — legado dash-grid (~8473) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="lc-card">
          <h4 style={{ margin: '0 0 10px', fontSize: 14 }}><i className="ti ti-map-2" /> Mapa da marcação</h4>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <iframe
              title="Mapa do ponto"
              style={{ width: '100%', height: 300, border: 0, display: 'block' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={pontoMapSrc(mapLat, mapLng, config.maps_key)}
            />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
            {ultima
              ? `Última marcação: ${ultima.lat.toFixed(5)}, ${ultima.lng.toFixed(5)}`
              : 'Aguardando a primeira marcação do dia.'}
          </div>
        </div>

        <div className="lc-card">
          <h4 style={{ margin: '0 0 10px', fontSize: 14 }}><i className="ti ti-settings" /> Configuração {isAdmin ? '(admin)' : ''}</h4>
          {isAdmin
            ? <ConfigForm activeUnitId={activeUnitId} config={config} onSaved={(m) => { setMsg(m); router.refresh() }} onErro={setErro} />
            : <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
                A configuração do mapa e da cerca virtual é feita pelos administradores. Você só precisa registrar seu ponto pelos botões acima — sua localização é capturada automaticamente pelo GPS.
              </div>}
        </div>
      </div>

      {/* ── Ações (gestão) ── */}
      {podeGerir && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className="btn btn-primary" onClick={() => { setMsg(''); setErro(''); setNovoOpen(true) }}>
            <i className="ti ti-plus" /> Lançar marcação manual
          </button>
        </div>
      )}

      {/* ── Filtros (GET → server re-renderiza) ── */}
      <form method="GET" action="/ponto" className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-filter flt" /> Filtros</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginTop: 12 }}>
          {podeGerir && (
            <div className="field">
              <label>Colaborador</label>
              <select name="colaborador" defaultValue={filtros.colaborador}>
                <option value="">Todos</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Tipo de marcação</label>
            <select name="tipo" defaultValue={filtros.tipo}>
              <option value="">Todos</option>
              {PONTO_TIPOS.map((t) => <option key={t.k} value={t.k}>{t.l}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Validação GPS</label>
            <select name="validacao" defaultValue={filtros.validacao}>
              <option value="">Todas</option>
              <option value="no_local">No local</option>
              <option value="fora">Fora do local</option>
            </select>
          </div>
          <div className="field">
            <label>Data de</label>
            <input type="date" name="di" defaultValue={filtros.di} />
          </div>
          <div className="field">
            <label>Data até</label>
            <input type="date" name="df" defaultValue={filtros.df} />
          </div>
        </div>
        <div className="rel-acts" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary"><i className="ti ti-search" /> Pesquisar</button>
          {temFiltro && <Link href="/ponto" className="btn"><i className="ti ti-x" /> Limpar</Link>}
        </div>
      </form>

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-list-details" /> {total} marcação(ões){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages}
      </div>

      {/* ── Espelho de ponto ── */}
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                {podeGerir && <th>Colaborador</th>}
                <th>Marcação</th>
                <th>Data e hora</th>
                <th>Coordenadas</th>
                <th className="num-r">Distância</th>
                <th>Origem</th>
                <th>Validação</th>
                {podeGerir && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={podeGerir ? 8 : 6} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-map-pin-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhuma marcação{temFiltro ? ' com esses filtros' : podeGerir ? ' registrada nesta unidade' : ' sua ainda'}.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  {podeGerir && <td><b>{r.colaborador_nome}</b></td>}
                  <td>
                    <i className={`ti ${TIPO_ICON[r.tipo ?? ''] ?? 'ti-clock'}`} style={{ marginRight: 5, color: 'var(--text-3)' }} />
                    {TIPO_LABEL[r.tipo ?? ''] ?? r.tipo ?? '—'}
                  </td>
                  <td>{r.data_hora ? dataHora(r.data_hora) : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {r.lat != null && r.lng != null ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : '—'}
                  </td>
                  <td className="num-r" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {r.distancia_m != null ? `${r.distancia_m} m` : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {r.fonte === 'gps' ? 'GPS' : r.fonte === 'web' ? 'Web' : r.ajustado_por ? 'Ajuste' : 'Manual'}
                  </td>
                  <td>
                    {r.validado_geo === true
                      ? <span style={pill('#E7F0EC', '#15803D')}><i className="ti ti-map-pin-check" /> No local</span>
                      : r.validado_geo === false
                        ? <span style={pill('#FBE9EB', '#D85563')}><i className="ti ti-map-pin-off" /> Fora do local</span>
                        : <span style={pill('#EEF2F7', '#64748B')}>—</span>}
                  </td>
                  {podeGerir && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn" onClick={() => { setMsg(''); setErro(''); setEditRow(r) }}>
                        <i className="ti ti-pencil" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cli-foot">
          <span>{total === 0 ? 'Nenhum registro' : `Exibindo página ${page} de ${totalPages} · ${total} registro(s)`}</span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {page > 1
                ? <Link className="btn" href={urlPagina(page - 1)}><i className="ti ti-chevron-left" /> Anterior</Link>
                : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}><i className="ti ti-chevron-left" /> Anterior</span>}
              {page < totalPages
                ? <Link className="btn" href={urlPagina(page + 1)}>Próxima <i className="ti ti-chevron-right" /></Link>
                : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>Próxima <i className="ti ti-chevron-right" /></span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Modais (gestão) ── */}
      {novoOpen && (
        <MarcacaoForm
          modo="novo"
          colaboradores={colaboradores}
          activeUnitId={activeUnitId}
          onClose={() => setNovoOpen(false)}
          onSaved={(m) => { setNovoOpen(false); setMsg(m); router.refresh() }}
        />
      )}
      {editRow && (
        <MarcacaoForm
          modo="editar"
          colaboradores={colaboradores}
          activeUnitId={activeUnitId}
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={(m) => { setEditRow(null); setMsg(m); router.refresh() }}
        />
      )}
    </div>
  )
}

function pill(bg: string, color: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color, whiteSpace: 'nowrap' }
}

// ─────────────────────────── Config do ponto (admin) ───────────────────────────
// Legado: bloco visível só p/ admin com 4 campos + "Salvar configuração" (index.html ~8475-8479).
function ConfigForm(props: { activeUnitId: string | null; config: ConfigPonto; onSaved: (m: string) => void; onErro: (e: string) => void }) {
  const { activeUnitId, config, onSaved, onErro } = props
  const [f, setF] = useState({
    maps_key: config.maps_key ?? '',
    raio: String(config.raio ?? 150),
    uni_lat: String(config.uni_lat ?? -27.5954),
    uni_lng: String(config.uni_lng ?? -48.548),
    modo_padrao: config.modo_padrao ?? 'unidade',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function salvar() {
    onErro('')
    if (!activeUnitId) { onErro('Selecione uma unidade ativa no topo para configurar o ponto.'); return }
    setSaving(true)
    const r = await salvarPontoConfig(activeUnitId, {
      raio: Number(f.raio) || 150,
      uni_lat: parseFloat(f.uni_lat),
      uni_lng: parseFloat(f.uni_lng),
      maps_key: f.maps_key,
      modo_padrao: f.modo_padrao === 'casa' ? 'casa' : 'unidade',
    })
    setSaving(false)
    if (!r.ok) { onErro(r.error || 'Erro ao salvar a configuração.'); return }
    onSaved('Configuração do ponto salva.')
  }

  return (
    <div>
      <div className="mf" style={{ marginBottom: 10 }}>
        <label>Chave da Google Maps API</label>
        <input style={inp} placeholder="AIza…" value={f.maps_key} onChange={(e) => set('maps_key', e.target.value)} />
      </div>
      <div className="mf" style={{ marginBottom: 10 }}>
        <label>Raio da cerca virtual (m)</label>
        <input style={inp} type="number" value={f.raio} onChange={(e) => set('raio', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="mf" style={{ flex: 1 }}>
          <label>Latitude da unidade</label>
          <input style={inp} value={f.uni_lat} onChange={(e) => set('uni_lat', e.target.value)} />
        </div>
        <div className="mf" style={{ flex: 1 }}>
          <label>Longitude</label>
          <input style={inp} value={f.uni_lng} onChange={(e) => set('uni_lng', e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={saving} onClick={salvar}>
        <i className="ti ti-device-floppy" /> {saving ? 'Salvando…' : 'Salvar configuração'}
      </button>
    </div>
  )
}

// ─────────────────────────── Form (modal) ───────────────────────────

/** datetime-local "YYYY-MM-DDTHH:mm" a partir de um ISO (hora local). */
function isoParaLocal(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date()
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function MarcacaoForm(props: {
  modo: 'novo' | 'editar'
  colaboradores: ColabOpt[]
  activeUnitId: string | null
  row?: RegistroRow
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const { modo, colaboradores, activeUnitId, row, onClose, onSaved } = props

  const [f, setF] = useState({
    colaborador_id: row?.colaborador_id ?? (colaboradores[0]?.id ?? ''),
    tipo: row?.tipo ?? 'entrada',
    data_hora: isoParaLocal(row?.data_hora),
    validado_geo: row?.validado_geo ?? true,
    lat: row?.lat != null ? String(row.lat) : '',
    lng: row?.lng != null ? String(row.lng) : '',
    motivo_ajuste: row?.motivo_ajuste ?? '',
  })
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const titulo = modo === 'novo' ? 'Lançar marcação manual' : 'Ajustar marcação'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (modo === 'novo' && !f.colaborador_id) { setErr('Selecione o colaborador.'); return }
    if (!f.tipo) { setErr('Selecione o tipo de marcação.'); return }
    if (!f.data_hora) { setErr('Informe a data e hora.'); return }

    setSaving(true)
    let r
    if (modo === 'novo') {
      const input: AjustePontoInput = {
        colaborador_id: f.colaborador_id,
        tipo: f.tipo,
        data_hora: f.data_hora,
        fonte: 'manual',
        validado_geo: f.validado_geo,
        lat: f.lat || null,
        lng: f.lng || null,
        motivo_ajuste: f.motivo_ajuste || undefined,
        unidade_id: activeUnitId,
      }
      r = await criarAjustePonto(input)
    } else {
      r = await editarPonto({
        id: row!.id,
        tipo: f.tipo,
        data_hora: f.data_hora,
        validado_geo: f.validado_geo,
        motivo_ajuste: f.motivo_ajuste || undefined,
      })
    }
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved(modo === 'novo' ? 'Marcação lançada.' : 'Marcação ajustada.')
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} className="modal" style={{ width: 520 }}>
        <div className="modal-head">
          <h3><i className="ti ti-map-pin-check" /> {titulo}</h3>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div style={{ fontSize: 12.5, color: 'var(--red)', background: 'var(--red-bg)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}

          {modo === 'novo' ? (
            <div className="mf">
              <label>Colaborador <span className="req">*</span></label>
              <select style={inp} value={f.colaborador_id} onChange={(e) => set('colaborador_id', e.target.value)}>
                <option value="">Selecione…</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` · ${c.cargo}` : ''}</option>)}
              </select>
            </div>
          ) : (
            <div className="mf">
              <label>Colaborador</label>
              <input style={{ ...inp, background: 'var(--bg-2, #f5f5f5)' }} value={row?.colaborador_nome ?? '—'} disabled />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf">
              <label>Tipo <span className="req">*</span></label>
              <select style={inp} value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
                {PONTO_TIPOS.map((t) => <option key={t.k} value={t.k}>{t.l}</option>)}
              </select>
            </div>
            <div className="mf">
              <label>Data e hora <span className="req">*</span></label>
              <input type="datetime-local" style={inp} value={f.data_hora} onChange={(e) => set('data_hora', e.target.value)} />
            </div>
          </div>

          {modo === 'novo' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="mf"><label>Latitude (opcional)</label><input style={inp} inputMode="decimal" value={f.lat} onChange={(e) => set('lat', e.target.value)} placeholder="-27.59540" /></div>
              <div className="mf"><label>Longitude (opcional)</label><input style={inp} inputMode="decimal" value={f.lng} onChange={(e) => set('lng', e.target.value)} placeholder="-48.54800" /></div>
            </div>
          )}

          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.validado_geo} onChange={(e) => set('validado_geo', e.target.checked)} /> Validado no local (dentro da cerca virtual)
          </label>

          <div className="mf">
            <label>Motivo do ajuste {modo === 'editar' && <span className="req">*</span>}</label>
            <textarea
              style={{ ...inp, minHeight: 64, resize: 'vertical' }}
              value={f.motivo_ajuste}
              onChange={(e) => set('motivo_ajuste', e.target.value)}
              placeholder="Ex.: Esquecimento do colaborador / correção de horário"
            />
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
