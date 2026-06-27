// Ponte: o menu aponta "Categorias de Contas a receber" para /cadastros/categorias-receber;
// o módulo real vive em /catrec. Re-exporta para o link do menu chegar à tela real.
export { default } from '@/app/(app)/catrec/page'
export const dynamic = 'force-dynamic'
