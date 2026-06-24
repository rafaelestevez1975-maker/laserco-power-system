/** Mensagens padrão (tom consistente). Ver docs/CONSOLIDACAO.md (I3). */
export const ERRO = {
  sessao: 'Sessão expirada.',
  semPermissao: 'Você não tem permissão para esta ação.',
  naoEncontrado: 'Registro não encontrado.',
  campoObrigatorio: (campo: string) => `Informe ${campo}.`,
  falhaAo: (oQue: string) => `Falha ao ${oQue}.`,
} as const
