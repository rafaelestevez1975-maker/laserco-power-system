import { redirect } from 'next/navigation'
// Menu aponta /financeiro/conciliacao — o módulo é uma SPA de abas em /financeiro.
export default function Page() { redirect('/financeiro?tab=conciliacao') }
