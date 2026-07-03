import FinanceiroPage from '../page'
// Renderiza o módulo já na aba 'pagar' PRESERVANDO a URL /financeiro/pagar — assim o item do menu
// lateral correspondente acende (antes era redirect p/ /financeiro?tab e o menu não trocava).
export default function Page() {
  return <FinanceiroPage searchParams={Promise.resolve({ tab: 'pagar' })} />
}
