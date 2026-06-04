import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()

  // Read the session from the auth cookie
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabaseAuth.auth.getUser()

  if (!user) {
    return NextResponse.json({ role: null, user_id: null }, { status: 401 })
  }

  // Look up role from erp_user_roles
  const admin = createAdminClient()
  const { data } = await admin
    .from('erp_user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    role:    data?.role ?? 'user',
    user_id: user.id,
  })
}