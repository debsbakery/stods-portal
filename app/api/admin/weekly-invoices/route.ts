// app/api/admin/weekly-invoices/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('weekly_invoices')
    .select(`
      id, invoice_number, week_start, week_end, total_amount, gst_amount,
      amount_paid, status, issued_at, revised_at, due_date,
      customer:customers ( id, business_name, email )
    `)
    .order('issued_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ weekly_invoices: data ?? [] })
}