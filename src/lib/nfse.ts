/**
 * NFS-e — constantes e helpers puros (client-safe). Portados do legado
 * (legacy/index.html ~8493-8500). Integração com provedores municipais
 * (ABRASF, Betha, WebISS, ISSNet, Nota Carioca, NFS-e Paulistana) + padrão
 * Nacional ADN.
 */

// ── Mapa de provedores municipais (26 cidades) — legado NFSE_PROVEDORES L8493 ──
export const NFSE_PROVEDORES: Record<string, string> = {
  'São Paulo': 'NFS-e Paulistana',
  'Rio de Janeiro': 'Nota Carioca',
  'Porto Alegre': 'NFS-e POA · Betha',
  'Belo Horizonte': 'BHISS Digital',
  Fortaleza: 'ISS Fortaleza',
  'Goiânia': 'ISS.net Goiânia',
  'Cuiabá': 'ISSWeb Cuiabá',
  Manaus: 'NFS-e Manaus',
  'Florianópolis': 'NFPS-e Florianópolis',
  'Maceió': 'ISS Maceió',
  Caruaru: 'WebISS Caruaru',
  Petrolina: 'WebISS Petrolina',
  'Maringá': 'NFS-e Maringá · Betha',
  'Boa Vista': 'ISS Boa Vista',
  'Cabo Frio': 'NFS-e Cabo Frio',
  Canoas: 'NFS-e Canoas · Betha',
  Gramado: 'NFS-e Gramado',
  Juazeiro: 'WebISS Juazeiro',
  'Mogi das Cruzes': 'NFS-e Mogi',
  Osasco: 'ISS Osasco',
  Parauapebas: 'NFS-e Parauapebas',
  'São José dos Campos': 'NFS-e SJC',
  'São José dos Pinhais': 'NFS-e SJP',
  Sinop: 'NFS-e Sinop',
  Suzano: 'NFS-e Suzano',
  'Taboão da Serra': 'NFS-e Taboão',
}

/** Provedor municipal da cidade, com fallback nacional (legado nfseProvedor L8494). */
export function nfseProvedor(cidade: string | null | undefined): string {
  return NFSE_PROVEDORES[(cidade || '').trim()] || 'NFS-e Nacional (padrão ADN)'
}

/** Hash determinístico de string (legado hashStr) — usado por alíquota/conexão. */
export function hashStr(s: string): number {
  let h = 0
  const str = s || ''
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** Alíquota ISS por cidade: uma de [2, 2.5, 3, 3.5, 4, 5] % (legado nfseAliquota L8499). */
export function nfseAliquota(cidade: string | null | undefined): number {
  return [2, 2.5, 3, 3.5, 4, 5][hashStr((cidade || '').trim()) % 6]
}

/** Unidade conectada? (legado nfseConectada L8500: hashStr('nfse'+nome)%4 !== 0). */
export function nfseConectada(nome: string | null | undefined): boolean {
  return hashStr('nfse' + (nome || '')) % 4 !== 0
}

// ── Política de emissão da rede (legado NFSE_POLICY / seg L8505-8509) ──
export type NfsePolitica = 'nenhuma' | 'venda' | 'execucao'
export const NFSE_POLITICA_DEFAULT: NfsePolitica = 'execucao'
export const NFSE_POR_SESSAO_DEFAULT = true

export const NFSE_POLITICAS: { k: NfsePolitica; label: string; icon: string }[] = [
  { k: 'nenhuma', label: 'Não emitir NF', icon: 'ti-file-off' },
  { k: 'venda', label: 'Emitir na venda', icon: 'ti-shopping-cart' },
  { k: 'execucao', label: 'Emitir na execução do serviço', icon: 'ti-checkup-list' },
]

/** Coluna "Emissão" da tabela de integração, conforme a política (legado polU). */
export function rotuloEmissao(p: NfsePolitica): string {
  return p === 'nenhuma' ? 'Não emite' : p === 'venda' ? 'Na venda' : 'Na execução'
}

// ── Status / tipo das notas emitidas ──
export type NfseStatus = 'autorizada' | 'cancelada' | 'processando' | 'erro'
export type NfseTipo = 'nfse' | 'nfe'
export type NfseFato = 'venda' | 'sessao'

/** Badge (classe os-st + rótulo) por status — espelha buildNotas emit. */
export function badgeStatus(st: string): { cls: string; label: string } {
  switch (st) {
    case 'autorizada':
      return { cls: 'os-fechada', label: 'Autorizada' }
    case 'cancelada':
      return { cls: 'os-cancelada', label: 'Cancelada' }
    case 'erro':
      return { cls: 'os-cancelada', label: 'Erro' }
    default:
      return { cls: 'os-andamento', label: 'Processando' }
  }
}

export function rotuloFato(f: string): string {
  return f === 'sessao' ? 'Sessão executada' : 'Venda'
}

export function rotuloTipo(t: string): string {
  return t === 'nfe' ? 'NF-e' : 'NFS-e'
}
