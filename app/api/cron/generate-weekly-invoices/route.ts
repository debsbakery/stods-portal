// app/api/cron/generate-weekly-invoices/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'
import { generateWeeklyInvoice, getPreviousWeekRange, sendWeeklyInvoiceEmail } from '@/lib/services/weekly-invoice-service'

export async function GET(request: NextRequest) {

  // ── Security ─────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Perth-aware: is today actually Sunday? ────────────────────────────────
  const now       = new Date()
  const perth     = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Perth' }))
  const dayOfWeek = perth.getDay() // 0 = Sunday

  // Allow bypass via ?force=true for manual testing
  const url = new URL(request.url)
  const force = url.searchParams.get('force') === 'true'

  if (dayOfWeek !== 0 && !force) {
    console.log(`[CRON weekly-invoices] Not Sunday in Perth (day=${dayOfWeek}) — skipping`)
    return NextResponse.json({
      success: true,
      skipped: true,
      reason:  `Not Sunday in Perth (day=${dayOfWeek})`,
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
      )

      // Send email if invoice was created/revised
      let emailSent = false
      let emailError = ''
      if (result.success && result.weekly_invoice_id) {
        try {
          await sendWeeklyInvoiceEmail(result.weekly_invoice_id)
          emailSent = true
          console.log(`[CRON] Email sent for ${customer.business_name}`)
        } catch (e: any) {
          emailError = e.message
          console.error(`[CRON] Email failed for ${customer.business_name}:`, e.message)
        }
      }

      results.push({
        customer_id:   customer.id,
        business_name: customer.business_name ?? customer.email,
        status:        result.success ? 'ok' : 'skipped',
        message:       result.message,
        email_sent:    emailSent,
        email_error:   emailError || undefined,
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