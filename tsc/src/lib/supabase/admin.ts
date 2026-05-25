import { createClient } from '@supabase/supabase-js'

// Server-only client that bypasses RLS. Use for ingestion jobs and admin tasks.
// NEVER import this from client components.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
