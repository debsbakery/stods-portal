import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const ADMIN_EMAILS = [
  'stodsbakery@outlook.com',
  'admin@allstarsbakery.com',
  'orders@norbakebroome.com',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const res = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isApi = pathname.startsWith('/api/admin')

  if (!user) {
    return isApi
      ? NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
      : NextResponse.redirect(new URL('/auth/login', req.url))
  }

  if (!ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? '')) {
    return isApi
      ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      : NextResponse.redirect(new URL('/', req.url))
  }

  return res
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}