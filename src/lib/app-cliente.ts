/**
 * App do Cliente — config de PROGRAMA (regras de pontos/cashback, abas, features,
 * catálogo de resgates) + tipos. Os DADOS DE NEGÓCIO (cliente, serviços, unidades,
 * profissionais, próximo agendamento, histórico, pacotes) vêm REAIS do banco via
 * props (ver app-cliente/page.tsx). Antes este arquivo continha dados fictícios
 * ("Mariana Costa", serviços/unidades inventados) — removidos.
 */

// ── Tipos do payload real (montado no server e passado ao mockup) ──
export type AppProfile = { nome: string; nomeCompleto: string; pts: number; nivel: string; cash: number; cashPct: number }
export type AppNext = { serv: string; data: string; prof: string; unid: string }
export type AppPkg = { serv: string; done: number; total: number }
export type AppServ = { n: string; d: string; p: string; ic: string }
export type AppUnit = { n: string; e: string; t: string }
export type AppData = {
  profile: AppProfile | null
  next: AppNext | null
  services: AppServ[]
  units: AppUnit[]
  professionals: string[]
  history: [string, string][]
  packages: AppPkg[]
}

export type AppRedeem = { n: string; p: number; ic: string }
export type AppTab = { k: string; label: string; icon: string }

// ── Abas do app (UI scaffolding) ──
export const APP_TABS: AppTab[] = [
  { k: 'home', label: 'Início', icon: 'ti-home' },
  { k: 'agendar', label: 'Agendar', icon: 'ti-calendar-plus' },
  { k: 'sessoes', label: 'Sessões', icon: 'ti-checkup-list' },
  { k: 'fidelidade', label: 'Fidelidade', icon: 'ti-gift' },
  { k: 'unidades', label: 'Unidades', icon: 'ti-map-pin' },
]

// Chips de data/horário do formulário de Agendar (scaffolding do protótipo).
export const APP_DATAS = ['Qua 11', 'Qui 12', 'Sex 13', 'Sáb 14', 'Seg 16']
export const APP_HORARIOS = ['09:00', '10:20', '11:40', '14:00', '15:20', '16:40']

// Features do painel "Sobre o app" (descrição do produto).
export const APP_FEATS = [
  'Agendamento de sessões em segundos',
  'Catálogo de serviços com preços',
  'Sessões contratadas x realizadas',
  'Endereços e contato das unidades',
  'Clube de fidelidade e resgate por pontos',
  'Indique & Ganhe: 50 pts + sorteio mensal',
]

// Catálogo de RESGATES do clube (config do programa de fidelidade).
export const APP_REDEEM: AppRedeem[] = [
  { n: 'Avaliação + skincare', p: 300, ic: 'ti-clipboard-heart' },
  { n: 'Gloss Laser&Co (brinde)', p: 500, ic: 'ti-gift' },
  { n: 'Hidratação facial', p: 600, ic: 'ti-droplet' },
  { n: 'Lip Glow', p: 800, ic: 'ti-mood-smile' },
  { n: 'PDRN · 1 ampola', p: 1200, ic: 'ti-vaccine' },
  { n: 'Hollywood Peel', p: 1500, ic: 'ti-stars' },
]

// Regras de pontos/cashback (config do programa).
export const REGRAS_PONTOS = {
  pontoPorReal: 1, // R$ 1 = 1 ponto
  pontosPorReal10: 100, // 100 pts ≈ R$ 10
  validadePontosMeses: 12,
  cashback: { Bronze: 3, Prata: 5, Ouro: 8 } as Record<string, number>,
  validadeCashbackMeses: 6,
  ptsPorIndicacao: 50, // +50 pts por amigo indicado
  maxAmigos: 5,
}

// Nível do clube a partir do saldo de pontos (regra do programa de fidelidade).
export function nivelDePontos(pts: number): 'Bronze' | 'Prata' | 'Ouro' {
  if (pts >= 3000) return 'Ouro'
  if (pts >= 1000) return 'Prata'
  return 'Bronze'
}

// Ícone do serviço por palavra-chave do nome/grupo (apenas estética).
export function iconeServico(nome: string): string {
  const n = (nome || '').toLowerCase()
  if (/avalia/.test(n)) return 'ti-clipboard-heart'
  if (/peel|hollywood|carbono/.test(n)) return 'ti-stars'
  if (/lip|gloss|labial|boca/.test(n)) return 'ti-mood-smile'
  if (/melasma|mancha|clarea/.test(n)) return 'ti-sun'
  if (/ultra|cel|corpor|abdom|firmez/.test(n)) return 'ti-windmill'
  if (/pdrn|exoss|bioestim|rejuven/.test(n)) return 'ti-sparkles'
  if (/hidrat|skin|facial/.test(n)) return 'ti-droplet'
  if (/depila|laser/.test(n)) return 'ti-bolt'
  return 'ti-sparkles'
}
