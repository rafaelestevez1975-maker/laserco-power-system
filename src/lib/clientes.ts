/**
 * Helpers de Clientes — paridade com o legado (legacy/index.html ~3242-3324).
 * Funções PURAS (client-safe): parse de CSV, auto-map de colunas, inferência de gênero,
 * limpeza de nome e dedup em lote. Usadas pelo modal de Importação de clientes.
 *
 * Observação: o legado também aceitava .xlsx via a lib global XLSX. Aqui suportamos CSV
 * (separador ; ou , com BOM). Para .xlsx, oriente o usuário a exportar como CSV
 * (o botão "Baixar modelo de planilha" gera um CSV com BOM).
 */

// ── Campos de import e seus aliases (legado IMP_FIELDS) ──
export const IMP_FIELDS: Record<string, string[]> = {
  nome: ['nome', 'name', 'cliente', 'nome completo', 'nome do cliente'],
  telefone: ['telefone', 'número do telefone', 'numero do telefone', 'phone', 'celular', 'whatsapp', 'fone'],
  email: ['e-mail', 'email', 'e mail'],
  documento: ['documento', 'cpf', 'cnpj', 'número do documento', 'numero do documento', 'doc'],
  genero: ['gênero', 'genero', 'sexo', 'gender'],
  ativo: ['ativo', 'active', 'status'],
  verificado: ['verificado', 'verified'],
  unidade: ['unidade', 'unidades', 'loja', 'salão', 'salao', 'salon'],
  origem: ['origem', 'onde nos conheceu', 'como nos conheceu', 'fonte', 'source', 'canal'],
}

export type ImpField = keyof typeof IMP_FIELDS
export const IMP_FIELD_KEYS = Object.keys(IMP_FIELDS) as ImpField[]

export function impNorm(s: unknown): string {
  return String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Auto-map: para cada campo, acha o índice da coluna cujo cabeçalho casa com algum alias. */
export function impAutoMap(headers: string[]): Partial<Record<ImpField, number>> {
  const map: Partial<Record<ImpField, number>> = {}
  for (const f of IMP_FIELD_KEYS) {
    const idx = headers.findIndex((h) => IMP_FIELDS[f].includes(impNorm(h)))
    if (idx >= 0) map[f] = idx
  }
  return map
}

/** Parse de CSV: detecta separador (; tem prioridade, senão ,) e remove BOM. */
export function impParseCSV(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { headers: [], rows: [] }
  const sep = lines[0].includes(';') ? ';' : ','
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
  const headers = split(lines[0])
  const rows = lines.slice(1).map(split).filter((r) => r.some((c) => c.trim()))
  return { headers, rows }
}

// ── Inferência de gênero por nome (legado IMP_FEM/IMP_MASC + sufixos) ──
const IMP_FEM = new Set(
  'maria,ana,juliana,camila,fernanda,patricia,larissa,bruna,carla,beatriz,gabriela,mariana,aline,tatiane,vanessa,daniela,rafaela,leticia,amanda,priscila,sabrina,renata,debora,eduarda,isabela,natalia,bianca,carolina,jessica,michele,danielle,nubia,telma,manu,laiz,margo,ivone,nilma,luciana,adriana,sandra,simone,cristina,elaine,rosana,marcia,andrea,luana,jaqueline,viviane,monica,raquel,sonia,silvia,claudia,denise,katia,flavia,vera,lucia,rita,ester,helena,laura,alice,sofia,valentina,heloisa,lorena,livia,manuela,isadora,melissa,agatha,yasmin,rebeca,clara,marina,giovanna,cecilia,elisa,roberta,tatiana,carol,gisele,nicole,barbara,paula,ingrid,karina,marta,rosa,aparecida,francisca,ivete,suely,katherine,lais,leia,najla,thais,vitoria,rayane,emanuelly,heloana'.split(','),
)
const IMP_MASC = new Set(
  'joao,jose,antonio,francisco,carlos,paulo,pedro,lucas,luiz,marcos,luis,gabriel,rafael,daniel,marcelo,bruno,eduardo,felipe,rodrigo,manoel,manuel,nelson,roberto,fabio,alexandre,andre,fernando,sergio,ricardo,jorge,mario,geraldo,sebastiao,gustavo,leonardo,julio,cesar,diego,vitor,victor,matheus,guilherme,arthur,davi,bernardo,miguel,heitor,enzo,samuel,henrique,murilo,caio,vinicius,thiago,tiago,renato,wagner,anderson,wesley,william,douglas,leandro,jefferson,adriano,marcio,rogerio,claudio,valdir,osvaldo,sidney,elias,ivan,igor,reginaldo,everton,alan,allan,italo,breno,otavio,marcondes,robson'.split(','),
)

function impDeacc(x: string): string {
  return (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Infere 'Feminino'/'Masculino' a partir do primeiro nome (ou '' se indefinido). */
export function impInferGender(nome: string): '' | 'Feminino' | 'Masculino' {
  const f = impDeacc((nome || '').replace(/[^A-Za-zÀ-ÿ ]/g, '').trim().split(' ')[0] || '').toLowerCase()
  if (!f) return ''
  if (IMP_FEM.has(f)) return 'Feminino'
  if (IMP_MASC.has(f)) return 'Masculino'
  if (/a$/.test(f)) return 'Feminino'
  if (/(o|or|el|son|ton|nho|io)$/.test(f)) return 'Masculino'
  if (/e$/.test(f)) return 'Feminino'
  return ''
}

/** Sanitiza nome colado de planilha: remove data/telefone por TAB, corta dígitos finais, limita 120. */
export function impCleanName(raw: string): string {
  if (!raw) return ''
  const parts = String(raw).split(/\t+/)
  const cands: string[] = []
  for (let p of parts) {
    p = p.trim()
    if (!p) continue
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(p)) continue
    if (/^[\d\s().+-]+$/.test(p)) continue
    if (/\d/.test(p) && p.replace(/\D/g, '').length >= 6) continue
    cands.push(p)
  }
  let nm = cands.length ? cands[0] : ''
  nm = nm.replace(/\s+/g, ' ').replace(/\d.*$/, '').trim()
  return nm.slice(0, 120)
}

/** Normaliza 'Feminino'/'Masculino'/'Outro' (qualquer caixa) → enum do banco. */
export function generoEnum(g: string): 'female' | 'male' | 'other' | null {
  const n = impDeacc((g || '').toLowerCase().trim())
  if (!n) return null
  if (n.startsWith('f')) return 'female'
  if (n.startsWith('m')) return 'male'
  if (n) return 'other'
  return null
}

// ── Pipeline de processamento (dedup em lote, igual ao legado impDoImport) ──
export type ImpRaw = string[]
export type ImpRecord = {
  nome: string
  telefone: string
  email: string
  documento: string
  genero: '' | 'Feminino' | 'Masculino'
  ativo: boolean
  verificado: boolean
  origem: string
  unidade: string
  _s: number
}

export type ImpResult = {
  recs: ImpRecord[]
  dups: number // duplicados ignorados
  genFill: number // gêneros inferidos por nome
}

/**
 * Processa as linhas lidas conforme o mapeamento, infere gênero quando ausente e faz
 * dedup por documento('D'+doc) > telefone('T'+tel) > nome('N'+nome), mantendo o de maior score
 * (_s = doc*4 + genero*2 + email*1). Idêntico ao legado.
 */
export function impProcess(
  rows: ImpRaw[],
  map: Partial<Record<ImpField, number>>,
  opts: { origem: string; dedup: boolean },
): ImpResult {
  const g = (r: ImpRaw, f: ImpField): string => (map[f] != null ? String(r[map[f]!] || '').trim() : '')
  const byKey: Record<string, ImpRecord> = {}
  const order: string[] = []
  let dups = 0
  let genFill = 0

  rows.forEach((r) => {
    const nome = impCleanName(g(r, 'nome'))
    const telRaw = g(r, 'telefone')
    const docRaw = g(r, 'documento')
    const email = g(r, 'email')
    const tel = telRaw.replace(/\D/g, '')
    const doc = docRaw.replace(/\D/g, '')
    if (!nome && !tel && !email) return

    let genero = (g(r, 'genero') as ImpRecord['genero'])
    if (!genero) {
      const gi = impInferGender(nome)
      if (gi) { genero = gi; genFill++ }
    }
    let uc = g(r, 'unidade')
    if (uc.indexOf(',') >= 0) uc = uc.split(',')[0].trim()

    const ativoRaw = g(r, 'ativo')
    const rec: ImpRecord = {
      nome: nome || '(sem nome)',
      telefone: telRaw,
      email,
      documento: docRaw,
      genero,
      ativo: /sim|ativo|true|1/i.test(ativoRaw) || ativoRaw === '',
      verificado: /sim|true|1/i.test(g(r, 'verificado')),
      origem: opts.origem,
      unidade: uc,
      _s: (doc ? 4 : 0) + (genero ? 2 : 0) + (email ? 1 : 0),
    }
    const key = opts.dedup
      ? (doc ? 'D' + doc : (tel ? 'T' + tel : 'N' + nome.toLowerCase()))
      : 'X' + order.length
    if (byKey[key]) {
      dups++
      if (rec._s > byKey[key]._s) byKey[key] = rec
    } else {
      byKey[key] = rec
      order.push(key)
    }
  })

  return { recs: order.map((k) => byKey[k]), dups, genFill }
}

/** Conteúdo do CSV modelo (com BOM), idêntico ao legado impModeloCSV. */
export const IMP_MODELO_CSV =
  '﻿Nome;Telefone;E-mail;Documento;Gênero;Ativo;Verificado;Unidade;Origem\n' +
  'Maria Silva;+55 (48) 99999-0000;maria@email.com;CPF: 000.000.000-00;Feminino;Sim;Sim;Florianópolis - Centro;Loja física'
