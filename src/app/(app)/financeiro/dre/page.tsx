import { redirect } from 'next/navigation'
// Menu aponta /financeiro/dre — o módulo é uma SPA de abas em /financeiro.
export default function Page() { redirect('/financeiro?tab=dre') }
