export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customer_id: string }> }
) {
  const { customer_id } = await params
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  const supabase = createAdminClient()

  let query = supabase
    .from('orders')
    .select(`
      id,
      invoice_number,
      delivery_date,
      total_amount,
      status,
      order_items (
        id,
        product_name,
        quantity,
        unit_price,
        subtotal,
        gst_applicable
      )
    `)
    .eq('customer_id', customer_id)
    .not('status', 'eq', 'cancelled')
    .order('delivery_date', { ascending: true })

  if (from) query = query.gte('delivery_date', from)
  if (to)   query = query.lte('delivery_date', to)

  const { data: orders, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Build per-invoice GST summary ─────────────────────────────────────
  const invoices = (orders ?? []).map(order => {
    const items = order.order_items ?? []

    const gstIncTotal  = items
      .filter((i: any) => i.gst_applicable)
      .reduce((s: number, i: any) => s + Number(i.subtotal), 0)

    const gstFreeTotal = items
      .filter((i: any) => !i.gst_applicable)
      .reduce((s: number, i: any) => s + Number(i.subtotal), 0)

    const gstAmount    = gstIncTotal / 11
    const totalEx      = gstIncTotal - gstAmount + gstFreeTotal

    return {
      invoice_number: order.invoice_number,
      delivery_date:  order.delivery_date,
      total_inc_gst:  Math.round(Number(order.total_amount) * 100) / 100,
      gst_inc_total:  Math.round(gstIncTotal  * 100) / 100,
      gst_free_total: Math.round(gstFreeTotal * 100) / 100,
      gst_amount:     Math.round(gstAmount    * 100) / 100,
      total_ex_gst:   Math.round(totalEx      * 100) / 100,
    }
  })

  // ── Monthly totals ────────────────────────────────────────────────────
  const monthMap: Record<string, {
    month:          string
    total_inc_gst:  number
    gst_inc_total:  number
    gst_free_total: number
    gst_amount:     number
    total_ex_gst:   number
    invoice_count:  number
  }> = {}

  for (const inv of invoices) {
    const d     = new Date(inv.delivery_date)
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('en-AU', { month: 'long', year: 'numeric' })

    if (!monthMap[key]) {
      monthMap[key] = {
        month:          label,
        total_inc_gst:  0,
        gst_inc_total:  0,
        gst_free_total: 0,
        gst_amount:     0,
        total_ex_gst:   0,
        invoice_count:  0,
      }
    }

    monthMap[key].total_inc_gst  += inv.total_inc_gst
    monthMap[key].gst_inc_total  += inv.gst_inc_total
    monthMap[key].gst_free_total += inv.gst_free_total
    monthMap[key].gst_amount     += inv.gst_amount
    monthMap[key].total_ex_gst   += inv.total_ex_gst
    monthMap[key].invoice_count  += 1
  }

  const monthly = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      ...v,
      total_inc_gst:  Math.round(v.total_inc_gst  * 100) / 100,
      gst_inc_total:  Math.round(v.gst_inc_total  * 100) / 100,
      gst_free_total: Math.round(v.gst_free_total * 100) / 100,
      gst_amount:     Math.round(v.gst_amount     * 100) / 100,
      total_ex_gst:   Math.round(v.total_ex_gst   * 100) / 100,
    }))

  // ── Grand totals ──────────────────────────────────────────────────────
  const totals = invoices.reduce((acc, inv) => ({
    total_inc_gst:  acc.total_inc_gst  + inv.total_inc_gst,
    gst_inc_total:  acc.gst_inc_total  + inv.gst_inc_total,
    gst_free_total: acc.gst_free_total + inv.gst_free_total,
    gst_amount:     acc.gst_amount     + inv.gst_amount,
    total_ex_gst:   acc.total_ex_gst   + inv.total_ex_gst,
  }), {
    total_inc_gst: 0, gst_inc_total: 0,
    gst_free_total: 0, gst_amount: 0, total_ex_gst: 0,
  })

  return NextResponse.json({
    invoices,
    monthly,
    totals: {
      total_inc_gst:  Math.round(totals.total_inc_gst  * 100) / 100,
      gst_inc_total:  Math.round(totals.gst_inc_total  * 100) / 100,
      gst_free_total: Math.round(totals.gst_free_total * 100) / 100,
      gst_amount:     Math.round(totals.gst_amount     * 100) / 100,
      total_ex_gst:   Math.round(totals.total_ex_gst   * 100) / 100,
    },
  })
}