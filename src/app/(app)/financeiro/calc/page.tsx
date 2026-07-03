import { redirect } from 'next/navigation'
// Menu aponta /financeiro/calc — o módulo é uma SPA de abas em /financeiro.
export default function Page() { redirect('/financeiro?tab=calc') }
