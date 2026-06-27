/**
 * Helpers do módulo RH + Ponto Digital (client-safe: funções puras).
 * Porta as fórmulas/regras do legado (legacy/index.html e legacy/portal-rh.html).
 */

// ─────────────────────────── PONTO DIGITAL ───────────────────────────

/** Tipos de marcação (legado PONTO_TIPOS, index.html ~8424). */
export const PONTO_TIPOS: { k: string; l: string; ic: string }[] = [
  { k: 'entrada', l: 'Entrada', ic: 'ti-login-2' },
  { k: 'saida_almoco', l: 'Saída p/ almoço', ic: 'ti-coffee' },
  { k: 'volta_almoco', l: 'Retorno do almoço', ic: 'ti-arrow-back-up' },
  { k: 'saida', l: 'Saída', ic: 'ti-logout-2' },
]

/** Config da cerca virtual do ponto (espelha ponto_config). */
export type PontoConfig = {
  raio: number
  uni_lat: number
  uni_lng: number
  maps_key: string
  modo_padrao: 'unidade' | 'casa'
}

/** Defaults da config do ponto (legado PONTO_CFG, index.html ~8415-8422). */
export const PONTO_DEFAULTS: PontoConfig = {
  raio: 150,
  uni_lat: -27.5954, // Florianópolis - Centro (padrão)
  uni_lng: -48.548,
  maps_key: '',
  modo_padrao: 'unidade',
}

/**
 * Distância em metros (Haversine) entre dois pontos GPS.
 * Porta literal de _haversine (index.html ~8426): R = 6371000.
 */
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const t = (x: number) => (x * Math.PI) / 180
  const dla = t(bLat - aLat)
  const dlo = t(bLng - aLng)
  const x =
    Math.sin(dla / 2) ** 2 +
    Math.cos(t(aLat)) * Math.cos(t(bLat)) * Math.sin(dlo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/** true = dentro da cerca virtual (dist <= raio). Regra do legado (index.html ~8441). */
export function dentroDaCerca(dist: number, raio: number): boolean {
  return dist <= raio
}

/**
 * URL do mapa embed (legado pontoMapSrc, index.html ~8427).
 * Com chave → Google Maps Embed (zoom 17); sem chave → OpenStreetMap com bbox+marker.
 */
export function pontoMapSrc(lat: number, lng: number, mapsKey: string): string {
  if (mapsKey) {
    return (
      'https://www.google.com/maps/embed/v1/place?key=' +
      encodeURIComponent(mapsKey) +
      '&q=' + lat + '%2C' + lng + '&zoom=17'
    )
  }
  const d = 0.004
  return (
    'https://www.openstreetmap.org/export/embed.html?bbox=' +
    (lng - d) + '%2C' + (lat - d) + '%2C' + (lng + d) + '%2C' + (lat + d) +
    '&layer=mapnik&marker=' + lat + '%2C' + lng
  )
}

// ─────────────────────────── FOLHA (INSS/IRRF/FGTS/13º) ───────────────────────────
// Tabelas progressivas vigentes (2025). O legado guardava valores prontos por
// colaborador (portal-rh.html: salarioBruto/inss/irrf/fgts/salarioLiquido); aqui
// calculamos pelos mesmos conceitos (Bruto, INSS, IRRF, FGTS 8%, Líquido, 13º).

/** INSS progressivo por faixas (2025), com teto. */
export function calcINSS(bruto: number): number {
  const faixas = [
    { ate: 1518.0, aliq: 0.075 },
    { ate: 2793.88, aliq: 0.09 },
    { ate: 4190.83, aliq: 0.12 },
    { ate: 8157.41, aliq: 0.14 },
  ]
  let inss = 0
  let anterior = 0
  for (const f of faixas) {
    if (bruto > anterior) {
      const base = Math.min(bruto, f.ate) - anterior
      inss += base * f.aliq
      anterior = f.ate
    } else break
  }
  return Math.round(inss * 100) / 100
}

/** IRRF (2025) sobre a base (bruto − INSS), tabela progressiva com dedução. */
export function calcIRRF(bruto: number, inss: number): number {
  const base = bruto - inss
  const faixas = [
    { ate: 2259.2, aliq: 0, ded: 0 },
    { ate: 2826.65, aliq: 0.075, ded: 169.44 },
    { ate: 3751.05, aliq: 0.15, ded: 381.44 },
    { ate: 4664.68, aliq: 0.225, ded: 662.77 },
    { ate: Infinity, aliq: 0.275, ded: 896.0 },
  ]
  const f = faixas.find((x) => base <= x.ate)!
  const irrf = base * f.aliq - f.ded
  return Math.max(0, Math.round(irrf * 100) / 100)
}

/** FGTS = 8% do bruto (depósito; não desconta do líquido). Legado usa *.08. */
export function calcFGTS(bruto: number): number {
  return Math.round(bruto * 0.08 * 100) / 100
}

export type FolhaCalc = {
  bruto: number
  inss: number
  irrf: number
  fgts: number
  outrosProventos: number
  outrosDescontos: number
  liquido: number
  decimoTerceiro: number
}

/** Cálculo completo da folha a partir do salário bruto (+ ajustes manuais). */
export function calcularFolha(bruto: number, outrosProventos = 0, outrosDescontos = 0): FolhaCalc {
  const b = Math.max(0, bruto || 0)
  const inss = calcINSS(b)
  const irrf = calcIRRF(b, inss)
  const fgts = calcFGTS(b)
  const liquido = Math.round((b + outrosProventos - inss - irrf - outrosDescontos) * 100) / 100
  return {
    bruto: b,
    inss,
    irrf,
    fgts,
    outrosProventos,
    outrosDescontos,
    liquido: Math.max(0, liquido),
    decimoTerceiro: b, // 13º integral (proporcional aos meses trabalhados é tratado fora)
  }
}

// ─────────────────────────── REGRAS DA REDE ───────────────────────────
// Porta literal das 10 regras do portal (legacy/portal-rh.html, array de regras r1..r10).

export type Nivel = 'obrigatorio' | 'importante' | 'recomendado'
export type Regra = { id: string; titulo: string; categoria: string; nivel: Nivel; itens: string[]; alerta?: string }

export const REGRAS_NIVEL: Record<Nivel, { label: string; bg: string; color: string }> = {
  obrigatorio: { label: 'Obrigatório', bg: '#FBE9EB', color: '#B91C1C' },
  importante: { label: 'Importante', bg: '#FEF3C7', color: '#A16207' },
  recomendado: { label: 'Recomendado', bg: '#E7F0EC', color: '#15803D' },
}

export const REGRAS_REDE: Regra[] = [
  {
    id: 'r1', titulo: 'Remuneração, Adiantamentos e Benefícios', categoria: 'Remuneração', nivel: 'obrigatorio',
    itens: [
      'O pagamento de salário segue o calendário oficial da rede e os canais corporativos.',
      'NÃO são concedidos adiantamentos de salário ou de 13º fora da política vigente.',
      'Benefícios e descontos seguem a legislação e o acordo coletivo da categoria.',
    ],
  },
  {
    id: 'r2', titulo: 'Uniforme e Apresentação Pessoal', categoria: 'Uniforme e Apresentação', nivel: 'obrigatorio',
    itens: [
      'Use o uniforme completo e limpo durante todo o turno de trabalho.',
      'Cabelo sempre preso para profissionais que realizam procedimentos.',
      'Unhas curtas e sem esmalte colorido para profissionais de saúde.',
      'Maquiagem discreta; perfumes leves e não invasivos.',
      'Uso de piercing visível ou tatuagens expostas deve ser avaliado pelo gestor de unidade.',
      'Celular pessoal guardado durante o atendimento — uso apenas no intervalo.',
    ],
  },
  {
    id: 'r3', titulo: 'Atendimento ao Cliente', categoria: 'Atendimento ao Cliente', nivel: 'obrigatorio',
    itens: [
      'Cumprimente o cliente ao entrar com sorriso e cordialidade.',
      'Chame o cliente pelo nome sempre que possível.',
      'Nunca deixe um cliente esperando sem informar o tempo estimado.',
      'Reclamações devem ser tratadas com calma e encaminhadas ao gestor se necessário.',
      'Nunca discuta com clientes. Priorize a solução, não o confronto.',
      'Confidencialidade total sobre informações e procedimentos de outros clientes.',
    ],
  },
  {
    id: 'r4', titulo: 'Conduta e Ambiente de Trabalho', categoria: 'Conduta', nivel: 'obrigatorio',
    itens: [
      'Tratamento respeitoso entre todos os colegas, independente de cargo ou função.',
      'Bullying, assédio moral ou sexual são motivos de demissão por justa causa.',
      'Conflitos internos devem ser comunicados ao RH — não nas redes sociais.',
      'Fofocas e comentários negativos sobre colegas ou a empresa são proibidos.',
      'Consumo de álcool ou drogas durante o expediente é vedado.',
    ],
    alerta: 'Infrações graves resultam em demissão por justa causa: furto, falsificação de registros, violação de dados de clientes, assédio, trabalho para concorrentes diretos.',
  },
  {
    id: 'r5', titulo: 'Saúde, Higiene e Segurança', categoria: 'Saúde e Segurança', nivel: 'obrigatorio',
    itens: [
      'Use todos os EPI indicados para o seu cargo (luvas, óculos, jaleco, etc.).',
      'Higienize as mãos antes e após cada atendimento — sem exceções.',
      'Equipamentos e materiais devem ser esterilizados conforme o protocolo da unidade.',
      'Mantenha seu espaço de trabalho limpo e organizado durante e após o atendimento.',
      'Acidentes ou incidentes de segurança devem ser reportados ao gestor imediatamente.',
      'Não realize procedimentos fora do escopo da sua certificação profissional.',
    ],
  },
  {
    id: 'r6', titulo: 'Uso de Redes Sociais', categoria: 'Redes Sociais', nivel: 'importante',
    itens: [
      'Não publique fotos do interior da loja, de clientes ou de colegas sem autorização prévia.',
      'Ao se identificar como colaborador da Laser&Co, mantenha postura condizente com a marca.',
      'Críticas públicas à empresa, gestores ou colegas são proibidas e sujeitas a sanções.',
      'Publicações que envolvam procedimentos realizados só são permitidas com autorização do cliente e da empresa.',
      'Para dúvidas sobre o que pode ser publicado, consulte o time de Marketing.',
    ],
  },
  {
    id: 'r7', titulo: 'Patrimônio e Equipamentos', categoria: 'Patrimônio', nivel: 'importante',
    itens: [
      'Zele pelos equipamentos, mobiliário e materiais da empresa.',
      'Danos causados por negligência podem ser descontados em folha, conforme legislação.',
      'Não leve materiais ou equipamentos para fora da unidade sem autorização por escrito.',
      'Relate ao gestor qualquer equipamento com defeito ou funcionamento inadequado.',
      'Uso indevido de sistemas e senhas corporativas é infração grave.',
    ],
  },
  {
    id: 'r8', titulo: 'Desenvolvimento e Carreira', categoria: 'Carreira', nivel: 'recomendado',
    itens: [
      'Participe das avaliações trimestrais de desempenho — são ferramentas de crescimento.',
      'Treinamentos oferecidos pela empresa são obrigatórios; cursos externos devem ser comunicados ao RH.',
      'Vagas internas são divulgadas no portal RH antes de abertas ao mercado.',
      'Promoções levam em conta assiduidade, desempenho e alinhamento com a cultura Laser&Co.',
      'Converse com seu gestor sobre plano de carreira a cada 6 meses.',
    ],
  },
  {
    id: 'r9', titulo: 'Registro de Vendas e Cortesias', categoria: 'Vendas e Registros', nivel: 'obrigatorio',
    itens: [
      'Toda venda e/ou cortesia deve ser registrada em sistema com o devido contrato assinado.',
      'Qualquer anotação fora do sistema, sem registro formal, é considerada irregularidade.',
      'Unidades bonificadas (cortesias) sem registro em sistema são proibidas.',
    ],
    alerta: 'Operações não registradas podem acarretar notificação formal ou demissão por justa causa, a critério da gestão, conforme a gravidade da ocorrência.',
  },
  {
    id: 'r10', titulo: 'Pagamentos via PIX em Conta de Colaborador', categoria: 'Pagamentos', nivel: 'obrigatorio',
    itens: [
      'É estritamente proibido receber pagamentos de clientes via PIX ou qualquer outra forma em conta pessoal de colaborador.',
      'Todo pagamento deve ser direcionado exclusivamente aos canais oficiais da empresa.',
    ],
    alerta: 'O recebimento de PIX em conta de colaborador configura demissão por justa causa e sujeita o colaborador às medidas legais cabíveis, incluindo ação cível e criminal.',
  },
]

export const REGRAS_CATEGORIAS = ['Todas', ...Array.from(new Set(REGRAS_REDE.map((r) => r.categoria)))]
