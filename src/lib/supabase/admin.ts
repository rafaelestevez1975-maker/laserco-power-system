import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client  só usar em server actions ou rotas API que precisam
// bypassar RLS (ex.: webhooks UAZAPI, crons internos). NUNCA expor pro browser.
export function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
