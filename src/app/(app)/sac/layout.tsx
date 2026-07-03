/**
 * Layout do módulo SAC  passthrough. O cabeçalho (rel-head "SAC · Central de Atendimento") e a
 * barra de abas (SacTabs) foram REMOVIDOS a pedido do cliente: a navegação do SAC já está na
 * sidebar e o topo já mostra o nome da tela. Cada página do SAC renderiza só o seu conteúdo.
 */
export default function SacLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
