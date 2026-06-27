// Ponte: o menu aponta "Categorias de Contas a pagar" para /cadastros/categorias-pagar;
// o módulo real vive em /catpag. Re-exporta para o link do menu chegar à tela real.
export { default } from '@/app/(app)/catpag/page'
export const dynamic = 'force-dynamic'
