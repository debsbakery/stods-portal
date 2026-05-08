// app/api/admin/weekly-invoices/[id]/send/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'
import { sendWeeklyInvoiceEmail } from '@/lib/services/weekly-invoice-service'

interface Params { params: { id: string } }

export async function POST(request: NextRequest, { params }: Params) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendWeeklyInvoiceEmail(params.id)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[weekly-invoice/send]', err)
    return NextResponse.json(
      { error: err.message ?? 'Failed to send email' },
      { status: 500 }
    )
  }
}