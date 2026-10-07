import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'

/**
 * Allows either a cron call (Bearer CRON_SECRET) or an admin session.
 * Returns null when authorised, or a 401 response to return early.
 */
export async function requireAdminOrCron(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth   = request.headers.get('authorization')

  if (secret && auth === `Bearer ${secret}`) return null
  if (await checkAdmin()) return null

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
