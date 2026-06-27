// O menu (menu.ts) aponta "Planos de Assinatura" para /cadastros/planos.
// O módulo funcional vive em /planos — aqui só reusamos o mesmo Server Component
// para que o link existente do menu chegue à tela real (sem editar menu.ts).
export { default, dynamic } from '@/app/(app)/planos/page'
