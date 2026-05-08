// app/api/admin/weekly-invoices/generate/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'
import { generateWeeklyInvoice, getPreviousWeekRange } from '@/lib/services/weekly-invoice-service'

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { customer_id, week_start, week_end, send_email = false } = body ?? {}

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id required' }, { status: 400 })
    }

    let start = week_start
    let end   = week_end
    if (!start || !end) {
      const range = getPreviousWeekRange()
      start = range.start
      end   = range.end
    }

    const result = await generateWeeklyInvoice(
      customer_id, start, end,
      { sendEmail: send_email }  // ✅ NEW
    )
    return NextResponse.json(result)

  } catch (err: any) {
    console.error('[weekly-invoice/generate]', err)
    return NextResponse.json({ error: err.message ?? 'Generation failed' }, { status: 500 })
  }
}