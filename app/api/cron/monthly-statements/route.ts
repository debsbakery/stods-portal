export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  // ── Security ──────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const now       = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
    .toISOString().split('T')[0]
  const endDate   = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0)
    .toISOString().split('T')[0]
  const monthLabel = lastMonth.toLocaleString('en-AU', { month: 'long', year: 'numeric' })

  console.log(`[CRON] Queueing statements — ${monthLabel}`)

  // ── Fetch eligible customers ───────────────────────────────
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, business_name, email, balance, invoice_brand')
    .gt('balance', 0)
    .not('email', 'is', null)
    .neq('email', '')

  if (error) {
    console.error('[CRON] Failed to fetch customers:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!customers || customers.length === 0) {
    console.log('[CRON] No customers with outstanding balance')
    return NextResponse.json({ success: true, queued: 0 })
  }

  // ── Clear any stale pending jobs for this period (safe re-run) ──
  await supabase
    .from('statement_jobs')
    .delete()
    .eq('month_label', monthLabel)
    .eq('status', 'pending')

  // ── Insert one job per customer ────────────────────────────
  const jobs = customers.map(c => ({
    customer_id:  c.id,
    period_start: startDate,
    period_end:   endDate,
    month_label:  monthLabel,
    status:       'pending',
  }))

  const { error: insertError } = await supabase
    .from('statement_jobs')
    .insert(jobs)

  if (insertError) {
    console.error('[CRON] Failed to insert jobs:', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  console.log(`[CRON] Queued ${jobs.length} statement jobs for ${monthLabel}`)

  return NextResponse.json({
    success:    true,
    queued:     jobs.length,
    period:     monthLabel,
    period_start: startDate,
    period_end:   endDate,
  })
}