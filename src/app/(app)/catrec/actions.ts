'use server'

// As categorias a receber (tipo=receita) usam exatamente a mesma lógica das
// categorias a pagar (tipo=despesa). Reaproveitamos as Server Actions de /catpag
// para não duplicar regra de negócio/RBAC (o `tipo` é sempre passado pelo cliente).
export {
  criarCategoria,
  editarCategoria,
  alternarAtivoCategoria,
  type ActionResult,
  type NovaCategoriaInput,
  type EditarCategoriaInput,
} from '@/app/(app)/catpag/actions'
