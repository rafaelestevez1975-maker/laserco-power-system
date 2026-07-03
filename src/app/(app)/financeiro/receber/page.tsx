import { redirect } from 'next/navigation'
// Menu aponta /financeiro/receber — o módulo é uma SPA de abas em /financeiro.
export default function Page() { redirect('/financeiro?tab=receber') }
