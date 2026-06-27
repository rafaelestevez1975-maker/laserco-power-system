// Ponte: o menu aponta "Perfis de acesso" para /cadastros/perfis; o módulo real
// (editor de permissões) vive em /perfis. Re-exporta para o link do menu chegar à tela real.
export { default } from '@/app/(app)/perfis/page'
export const dynamic = 'force-dynamic'
