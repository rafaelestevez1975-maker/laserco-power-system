/** Resultado padrão de toda Server Action do sistema. Ver docs/CONSOLIDACAO.md (D8). */
export type ActionResult<T = unknown> = { ok: boolean; error?: string } & T
