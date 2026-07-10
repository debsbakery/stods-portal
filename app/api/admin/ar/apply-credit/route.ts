import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { customer_id, credit_id, amount } = await req.json()

  if (!customer_id || !credit_id || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const applyAmount = Math.round(Number(amount) * 100) / 100

  // ── 1. Verify the credit has enough remaining ──
  const { data: credit } = await supabase
    .from('ar_transactions')
    .select('id, amount, amount_paid')
    .eq('id', credit_id)
    .eq('type', 'credit')
    .eq('customer_id', customer_id)
    .single()

  if (!credit) return NextResponse.json({ error: 'Credit not found' }, { status: 404 })

  const creditRemaining = Number(credit.amount) - Number(credit.amount_paid || 0)
  if (applyAmount > creditRemaining + 0.005) {
    return NextResponse.json(
      { error: `Credit only has $${creditRemaining.toFixed(2)} remaining` },
      { status: 400 }
    )
  }

  // ── 2. Apply to open invoices FIFO (this was missing — the one-sided bug) ──
  const { data: openInvoices } = await supabase
    .from('ar_transactions')
    .select('id, amount, amount_paid')
    .eq('customer_id', customer_id)
    .eq('type', 'invoice')
    .order('created_at', { ascending: true })

  let remaining = applyAmount
  for (const inv of openInvoices || []) {
    if (remaining <= 0.005) break
    const outstanding = Number(inv.amount) - Number(inv.amount_paid || 0)
    if (outstanding <= 0.005) continue
    const apply = Math.min(remaining, outstanding)

    await supabase
      .from('ar_transactions')
      .update({ amount_paid: Math.round((Number(inv.amount_paid || 0) + apply) * 100) / 100 })
      .eq('id', inv.id)

    remaining = Math.round((remaining - apply) * 100) / 100
  }

  const actuallyApplied = Math.round((applyAmount - remaining) * 100) / 100

  // ── 3. Mark the credit consumed by ONLY what actually landed on invoices ──
  const { error: creditError } = await supabase
    .from('ar_transactions')
    .update({ amount_paid: Math.round((Number(credit.amount_paid || 0) + actuallyApplied) * 100) / 100 })
    .eq('id', credit_id)

  if (creditError) {
    return NextResponse.json({ error: creditError.message }, { status: 500 })
  }

  // ── 4. Canonical balance ──
  const { data: txData } = await supabase
    .from('ar_transactions')
    .select('type, amount, amount_paid')
    .eq('customer_id', customer_id)

  const newBalance = Math.round(
    (txData ?? []).reduce((sum, tx) => {
      const owed = Number(tx.amount) - Number(tx.amount_paid || 0)
      if (tx.type === 'invoice') return sum + owed
      if (tx.type === 'credit')  return sum - owed
      return sum
    }, 0) * 100
  ) / 100

  await supabase.from('customers').update({ balance: newBalance }).eq('id', customer_id)

  return NextResponse.json({ success: true, applied: actuallyApplied, newBalance })
}