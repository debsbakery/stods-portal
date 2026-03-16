import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const isAdmin = await checkAdmin()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const updates = await request.json()
    const supabase = await createClient()

    // ── Status-only update (e.g. cancel) ──────────────────────────────────
    if (updates.status && !updates.items) {
      const { error } = await supabase
        .from('orders')
        .update({
          status:     updates.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Full order edit (items + total) ───────────────────────────────────
    await supabase.from('order_items').delete().eq('order_id', id)

    if (updates.items?.length > 0) {
      await supabase.from('order_items').insert(
        updates.items.map((item: any) => ({
          order_id:           id,
          product_id:         item.product_id,
          product_name:       item.product_name,
          custom_description: item.custom_description ?? null,  // ✅ ADDED
          quantity:           item.quantity,
          unit_price:         item.unit_price,
          subtotal:           item.quantity * item.unit_price,
          gst_applicable:     item.gst_applicable || false,
        }))
      )
    }

    const { error } = await supabase
      .from('orders')
      .update({
        total_amount: updates.total_amount,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}