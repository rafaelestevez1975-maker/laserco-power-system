import { AppClienteMockup } from '@/components/app-cliente/AppClienteMockup'

export const dynamic = 'force-dynamic'

/**
 * App do Cliente — protótipo interativo (phone mockup). Paridade com
 * buildAppCliente do legado (legacy/index.html ~4711). É uma demonstração
 * visual/navegável (sem persistência): tab bar de 5 abas + telas Início,
 * Agendar, Serviços, Sessões, Fidelidade, Unidades e o fluxo Indique & Ganhe.
 */
export default function AppClientePage() {
  return <AppClienteMockup />
}
