export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://debsbakery-portal.vercel.app'
    const response = await fetch(`${siteUrl}/api/ar/aging/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await response.json()
    console.log(`[CRON] AR aging updated`)

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('[CRON] AR aging failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}