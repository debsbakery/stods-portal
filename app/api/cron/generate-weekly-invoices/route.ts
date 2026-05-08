// app/api/cron/generate-weekly-invoices/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'
import { generateWeeklyInvoice, getPreviousWeekRange } from '@/lib/services/weekly-invoice-service'

export async function GET(request: NextRequest) {

  // ── Security ─────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Brisbane-aware: is today actually Sunday? ─────────────────────────────
  const now       = new Date()
  const brisbane  = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }))
  const dayOfWeek = brisbane.getDay() // 0 = Sunday

  if (dayOfWeek !== 0) {
    console.log(`[CRON weekly-invoices] Not Sunday in Brisbane (day=${dayOfWeek}) — skipping`)
    return NextResponse.json({
      success: true,
      skipped: true,
      reason:  `Not Sunday in Brisbane (day=${dayOfWeek})`,
    })
  }

  // ── Get the previous Sun–Sat week ─────────────────────────────────────────
  const { start: weekStart, end: weekEnd } = getPreviousWeekRange(now)
  console.log(`[CRON weekly-invoices] Processing week ${weekStart} → ${weekEnd}`)

  // ── Find all weekly-billing customers ────────────────────────────────────
  const supabase = createAdminClient()
  const { data: customers, error: cErr } = await supabase
    .from('customers')
    .select('id, business_name, email')
    .eq('invoice_frequency', 'weekly')
    .not('email', 'is', null)

  if (cErr) {
    console.error('[CRON weekly-invoices] Failed to fetch customers:', cErr)
    return NextResponse.json({ error: cErr.message }, { status: 500 })
  }

  if (!customers || customers.length === 0) {
    console.log('[CRON weekly-invoices] No weekly-billing customers found')
    return NextResponse.json({ success: true, processed: 0, skipped: 0 })
  }

  console.log(`[CRON weekly-invoices] ${customers.length} customer(s) to process`)

  // ── Process each customer ─────────────────────────────────────────────────
  const results: Array<{
    customer_id:   string
    business_name: string
    status:        string
    message:       string
    email_sent?:   boolean
    email_error?:  string
  }> = []

  for (const customer of customers) {
    try {
      const result = await generateWeeklyInvoice(
        customer.id,
        weekStart,
        weekEnd,
        { sendEmail: true }   // ✅ Always email on cron run
      )

      results.push({
        customer_id:   customer.id,
        business_name: customer.business_name ?? customer.email,
        status:        result.success ? 'ok' : 'skipped',
        message:       result.message,
        email_sent:    result.email_sent,
        email_error:   result.email_error,
      })

      console.log(`[CRON] ${customer.business_name}: ${result.message}`)

      // Rate limit: 1 second between customers (Resend daily limit safety)
      await new Promise(r => setTimeout(r, 1000))

    } catch (err: any) {
      console.error(`[CRON] ${customer.business_name} FAILED:`, err.message)
      results.push({
        customer_id:   customer.id,
        business_name: customer.business_name ?? customer.email,
        status:        'error',
        message:       err.message,
      })
    }
  }

  const processed = results.filter(r => r.status === 'ok').length
  const skipped   = results.filter(r => r.status === 'skipped').length
  const errors    = results.filter(r => r.status === 'error').length

  console.log(`[CRON weekly-invoices] Done — processed: ${processed}, skipped: ${skipped}, errors: ${errors}`)

  return NextResponse.json({
    success:    true,
    week_start: weekStart,
    week_end:   weekEnd,
    processed,
    skipped,
    errors,
    results,
  })
}