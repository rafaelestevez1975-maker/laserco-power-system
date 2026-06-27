// Ponte: o menu aponta "Parcerias" para /cadastros/parcerias; o módulo real
// (descontos/parcerias) vive em /descontos. Re-exporta para o link do menu chegar à tela real.
export { default } from '@/app/(app)/descontos/page'
export const dynamic = 'force-dynamic'
