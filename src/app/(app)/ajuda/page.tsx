import { AjudaManager } from '@/components/ajuda/AjudaManager'

export const dynamic = 'force-dynamic'

/**
 * Ajuda — base de conhecimento interativa (paridade com buildAjuda do legado).
 * Conteúdo estático (HELP_KB) com busca por texto (ranking), select por categoria
 * e home com tópicos populares + grade. Toda a interação é client-side.
 */
export default function AjudaPage() {
  return <AjudaManager />
}
