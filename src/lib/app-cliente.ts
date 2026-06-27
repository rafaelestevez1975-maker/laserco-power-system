/**
 * App do Cliente (mockup interativo) — constantes portadas do legado
 * (legacy/index.html ~4683-4825). É um protótipo demonstrativo (phone mockup),
 * com dados de exemplo idênticos ao legado.
 */

export const APP = {
  nome: 'Mariana',
  nomeCompleto: 'Mariana Costa',
  pts: 2480,
  nivel: 'Ouro',
  cash: 85,
  cashPct: 8,
}

export const APP_NEXT = {
  serv: 'PDRN e Exossomos',
  data: 'Qui, 12/06 · 14:00',
  prof: 'Karoline',
  unid: 'Florianópolis - Centro',
}

export type AppPkg = { serv: string; done: number; total: number }
export const APP_PKGS: AppPkg[] = [
  { serv: 'PDRN e Exossomos', done: 3, total: 6 },
  { serv: 'Hollywood Peel', done: 5, total: 6 },
  { serv: 'Melasma', done: 2, total: 4 },
]

export type AppServ = { n: string; d: string; p: string; ic: string }
export const APP_SERV: AppServ[] = [
  { n: 'PDRN e Exossomos', d: 'Bioestimulação e rejuvenescimento com PDRN + exossomos.', p: 'R$ 2.399', ic: 'ti-sparkles' },
  { n: 'Hollywood Peel', d: 'Peeling de carbono para luminosidade e poros.', p: 'R$ 479', ic: 'ti-stars' },
  { n: 'Melasma', d: 'Clareamento de manchas faciais com laser.', p: 'R$ 799', ic: 'ti-sun' },
  { n: 'UltraCel - Abdômen', d: 'Ultrassom microfocado para firmeza corporal.', p: 'R$ 4.499', ic: 'ti-windmill' },
  { n: 'Lip Glow', d: 'Hidratação e realce labial.', p: 'R$ 479', ic: 'ti-mood-smile' },
  { n: 'Avaliação', d: 'Avaliação facial/corporal com a especialista.', p: 'Gratuita', ic: 'ti-clipboard-heart' },
]

export type AppUnit = { n: string; e: string; t: string }
export const APP_UNITS: AppUnit[] = [
  { n: 'Florianópolis - Centro', e: 'Rua Felipe Schmidt, 390 · Sala 1204 · Centro · Florianópolis/SC', t: '(48) 3333-1010' },
  { n: 'São José', e: 'Av. Central, 1200 · Kobrasol · São José/SC', t: '(48) 99500-2210' },
  { n: 'Porto Alegre - Iguatemi', e: "Av. João Wallig, 1800 · Passo d'Areia · Porto Alegre/RS", t: '(51) 2103-2816' },
  { n: 'São Paulo - Vila Olímpia', e: 'Rua Fiandeiras, 929 · Vila Olímpia · São Paulo/SP', t: '(11) 94790-0641' },
]

export type AppRedeem = { n: string; p: number; ic: string }
export const APP_REDEEM: AppRedeem[] = [
  { n: 'Avaliação + skincare', p: 300, ic: 'ti-clipboard-heart' },
  { n: 'Gloss Laser&Co (brinde)', p: 500, ic: 'ti-gift' },
  { n: 'Hidratação facial', p: 600, ic: 'ti-droplet' },
  { n: 'Lip Glow', p: 800, ic: 'ti-mood-smile' },
  { n: 'PDRN · 1 ampola', p: 1200, ic: 'ti-vaccine' },
  { n: 'Hollywood Peel', p: 1500, ic: 'ti-stars' },
]

export type AppTab = { k: string; label: string; icon: string }
export const APP_TABS: AppTab[] = [
  { k: 'home', label: 'Início', icon: 'ti-home' },
  { k: 'agendar', label: 'Agendar', icon: 'ti-calendar-plus' },
  { k: 'sessoes', label: 'Sessões', icon: 'ti-checkup-list' },
  { k: 'fidelidade', label: 'Fidelidade', icon: 'ti-gift' },
  { k: 'unidades', label: 'Unidades', icon: 'ti-map-pin' },
]

// Histórico recente da tela Sessões (legado L4761)
export const APP_HISTORICO: [string, string][] = [
  ['PDRN e Exossomos', '30/05 · Karoline'],
  ['Hollywood Peel', '22/05 · Suzanne'],
  ['Melasma', '14/05 · Rita de Cássia'],
]

// Profissionais do select de Agendar (legado L4745)
export const APP_PROFISSIONAIS = ['Sem preferência', 'Karoline', 'Rita de Cássia', 'Suzanne']
// Chips de data/horário (legado L4747-4748)
export const APP_DATAS = ['Qua 11', 'Qui 12', 'Sex 13', 'Sáb 14', 'Seg 16']
export const APP_HORARIOS = ['09:00', '10:20', '11:40', '14:00', '15:20', '16:40']

// Features do painel "Sobre o app" (legado appFeats L4713)
export const APP_FEATS = [
  'Agendamento de sessões em segundos',
  'Catálogo de serviços com preços',
  'Sessões contratadas x realizadas',
  'Endereços e contato das unidades',
  'Clube de fidelidade e resgate por pontos',
  'Indique & Ganhe: 50 pts + sorteio mensal',
]

// Regras de pontos/cashback (legado L4768-4769)
export const REGRAS_PONTOS = {
  pontoPorReal: 1, // R$ 1 = 1 ponto
  pontosPorReal10: 100, // 100 pts ≈ R$ 10
  validadePontosMeses: 12,
  cashback: { Bronze: 3, Prata: 5, Ouro: 8 } as Record<string, number>,
  validadeCashbackMeses: 6,
  ptsPorIndicacao: 50, // +50 pts por amigo indicado
  maxAmigos: 5,
}
