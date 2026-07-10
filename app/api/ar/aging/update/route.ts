export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    console.log('📊 Updating AR aging report...')

    const supabase = await createClient()

    const { data: customers, error: custError } = await supabase
      .from('customers')
      .select('id, business_name, email, payment_terms')

    if (custError) throw custError

    const today = new Date()
    let updated = 0

    for (const customer of customers || []) {
      const { data: allTransactions } = await supabase
        .from('ar_transactions')
        .select('id, type, amount, amount_paid, due_date, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: true })

      const txs = allTransactions || []

      // ── Canonical balance ─────────────────────────────────────────────
      // Payments and applied credits live INSIDE invoice.amount_paid.
      // balance = Σ(invoice outstanding) − Σ(credit unapplied remainder)
      // NO payment-row term, NO full-credit term.
      let balance = 0
      for (const tx of txs) {
        const amount = Number(tx.amount || 0)
        const paid   = Number(tx.amount_paid || 0)
        if (tx.type === 'invoice' || tx.type === 'charge' || tx.type === 'late_fee') {
          balance += amount - paid
        } else if (tx.type === 'credit') {
          balance -= amount - paid
        }
        // 'payment' rows deliberately ignored — payments are reflected in amount_paid
      }
      balance = Math.round(balance * 100) / 100

      // ── Aging buckets: OUTSTANDING amounts on open invoices ──────────
      let current = 0, days_1_30 = 0, days_31_60 = 0, days_61_90 = 0, days_over_90 = 0

      for (const inv of txs) {
        if (inv.type !== 'invoice') continue
        const outstanding = Math.round((Number(inv.amount || 0) - Number(inv.amount_paid || 0)) * 100) / 100
        if (outstanding <= 0.01) continue

        const dueDate = new Date(inv.due_date || inv.created_at)
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000)

        if (daysOverdue <= 0) current += outstanding
        else if (daysOverdue <= 30) days_1_30 += outstanding
        else if (daysOverdue <= 60) days_31_60 += outstanding
        else if (daysOverdue <= 90) days_61_90 += outstanding
        else days_over_90 += outstanding
      }

      const unpaidTotal = current + days_1_30 + days_31_60 + days_61_90 + days_over_90

      const { error: upsertError } = await supabase
        .from('ar_aging')
        .upsert(
          {
            customer_id: customer.id,
            current: current.toFixed(2),
            days_1_30: days_1_30.toFixed(2),
            days_31_60: days_31_60.toFixed(2),
            days_61_90: days_61_90.toFixed(2),
            days_over_90: days_over_90.toFixed(2),
            total_due: unpaidTotal.toFixed(2),
          },
          { onConflict: 'customer_id' }
        )

      if (upsertError) {
        console.error(`❌ Aging upsert failed for ${customer.id}:`, upsertError)
        continue
      }

      await supabase
        .from('customers')
        .update({ balance: balance.toFixed(2) })
        .eq('id', customer.id)

      updated++
    }

    console.log(`✅ Aging updated for ${updated} customers`)

    return NextResponse.json({ success: true, updated, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('❌ Aging update error:', error)
    return NextResponse.json({ error: error.message || 'Aging update failed' }, { status: 500 })
  }
}