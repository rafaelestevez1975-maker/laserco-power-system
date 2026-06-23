import { createClient } from '@supabase/supabase-js'

/**
 * Cliente do Supabase DO SITE institucional (projeto `riutcbwillvqjrpaefkb`),
 * onde o lasercompany.com grava os leads (`lasercompany_leads`).
 * É um Supabase SEPARADO do backend do Power System (`lkii`).
 *
 * A anon key pública só consegue INSERIR (a RLS bloqueia SELECT) — por isso a
 * ponte precisa da SERVICE KEY do site para LER e sincronizar. Server-only.
 * Sem a chave, retorna null e a ponte cai no fallback (lkii.site_leads).
 */
export function siteClient() {
  const url = process.env.SITE_SUPABASE_URL || 'https://riutcbwillvqjrpaefkb.supabase.co'
  const key = process.env.SITE_SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function siteConfigurado(): boolean {
  return !!process.env.SITE_SUPABASE_SERVICE_KEY
}
