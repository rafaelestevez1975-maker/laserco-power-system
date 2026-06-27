'use client'

import { useMemo, useState } from 'react'
import { CobrancasTab, type NotifRow } from '@/components/juridico/CobrancasTab'
import { UnidadesTab, type UnidadeJur } from '@/components/juridico/UnidadesTab'
import { ModelosTab, type ModeloRow } from '@/components/juridico/ModelosTab'
import { JuridicoManager, type DocRow } from '@/components/juridico/JuridicoManager'

type Unidade = { id: string; nome: string }

type AssinaturaProps = {
  rows: DocRow[]
  carregouOk: boolean
  mostrarUnidade: boolean
  filtros: { status: string; q: string; unidade: string; di: string; df: string }
  kpis: { total: number; rascunho: number; andamento: number; concluido: number; expirado: number }
  page: number
  totalPages: number
  total: number
}

type Props = {
  migrationPendente: boolean
  activeUnitId: string | null
  activeUnitName: string
  unidades: Unidade[]
  notificacoes: NotifRow[]
  modelos: ModeloRow[]
  unidadesJur: UnidadeJur[]
  assinatura: AssinaturaProps
}

type TabKey = 'cobrancas' | 'unidades' | 'modelos' | 'assinatura'

const TABS: { k: TabKey; label: string; icon: string }[] = [
  { k: 'cobrancas', label: 'Cobranças (Financeiro)', icon: 'ti-gavel' },
  { k: 'unidades', label: 'Unidades & documentos', icon: 'ti-building-store' },
  { k: 'modelos', label: 'Modelos', icon: 'ti-file-text' },
  { k: 'assinatura', label: 'Documentos para assinatura', icon: 'ti-signature' },
]

export function JuridicoTabs(props: Props) {
  const { migrationPendente, notificacoes, modelos, unidadesJur, assinatura, activeUnitId, activeUnitName, unidades } = props
  const [tab, setTab] = useState<TabKey>('cobrancas')

  // Badge dinâmico: nº de notificações pendentes (jurUpdateBadge 4913 / jurNotifPend 4912).
  const pendentes = useMemo(() => notificacoes.filter((n) => n.status === 'pendente').length, [notificacoes])

  return (
    <div className="view active">
      <div className="rel-tabs" style={{ flexWrap: 'wrap' }} id="jurTabs">
        {TABS.map((t) => (
          <div
            key={t.k}
            className={`rel-tab ${t.k === tab ? 'active' : ''}`}
            onClick={() => setTab(t.k)}
            style={{ cursor: 'pointer' }}
          >
            <i className={`ti ${t.icon}`} /> {t.label}
            {t.k === 'cobrancas' && pendentes > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  display: 'inline-block',
                  minWidth: 18,
                  padding: '0 5px',
                  textAlign: 'center',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 800,
                  background: 'var(--red)',
                  color: '#fff',
                }}
              >
                {pendentes}
              </span>
            )}
          </div>
        ))}
      </div>

      {migrationPendente && (
        <div
          className="rel-legend"
          style={{ background: '#FFF8E1', color: 'var(--text)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <i className="ti ti-alert-triangle" style={{ color: 'var(--amber)', fontSize: 18 }} />
          <span>
            <b>Aplique a migration scripts/migrations/juridico.sql no lkii</b> para ativar as notificações
            extrajudiciais, os modelos e os documentos contratuais (tabelas <code>juridico_notificacoes</code>,{' '}
            <code>juridico_templates</code>, <code>juridico_documentos</code> + 7 modelos de seed). Enquanto isso, a
            tela funciona em modo vazio.
          </span>
        </div>
      )}

      {tab === 'cobrancas' && (
        <CobrancasTab notificacoes={notificacoes} migrationPendente={migrationPendente} />
      )}

      {tab === 'unidades' && (
        <UnidadesTab unidades={unidadesJur} modelos={modelos} migrationPendente={migrationPendente} />
      )}

      {tab === 'modelos' && <ModelosTab modelos={modelos} migrationPendente={migrationPendente} />}

      {tab === 'assinatura' && (
        <JuridicoManager
          rows={assinatura.rows}
          carregouOk={assinatura.carregouOk}
          activeUnitId={activeUnitId}
          activeUnitName={activeUnitName}
          unidades={unidades}
          mostrarUnidade={assinatura.mostrarUnidade}
          filtros={assinatura.filtros}
          kpis={assinatura.kpis}
          page={assinatura.page}
          totalPages={assinatura.totalPages}
          total={assinatura.total}
        />
      )}
    </div>
  )
}
