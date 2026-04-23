import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  try {
    const body = await request.json()
    const { sourceCustomerId, targetCustomerId, mode = 'merge' } = body

    if (!sourceCustomerId || !targetCustomerId) {
      return NextResponse.json({
        success: false,
        error: 'sourceCustomerId and targetCustomerId required',
      }, { status: 400 })
    }

    if (sourceCustomerId === targetCustomerId) {
      return NextResponse.json({
        success: false,
        error: 'Source and target customers are the same',
      }, { status: 400 })
    }

    // ── 1. Load source customer's contract prices ──────────────
    const { data: sourcePrices, error: sourceErr } = await supabase
      .from('customer_pricing')
      .select('product_id, contract_price, effective_from, effective_to')
      .eq('customer_id', sourceCustomerId)

    if (sourceErr) {
      return NextResponse.json({ success: false, error: sourceErr.message }, { status: 500 })
    }

    if (!sourcePrices || sourcePrices.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Source customer has no contract prices',
      }, { status: 400 })
    }

    let replaced = 0
    let added    = 0
    let skipped  = 0

    if (mode === 'replace') {
      // ── REPLACE MODE — delete all target's existing prices first ──
      const { count: existingCount } = await supabase
        .from('customer_pricing')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', targetCustomerId)

      replaced = existingCount || 0

      const { error: deleteErr } = await supabase
        .from('customer_pricing')
        .delete()
        .eq('customer_id', targetCustomerId)

      if (deleteErr) {
        return NextResponse.json({ success: false, error: `Delete failed: ${deleteErr.message}` }, { status: 500 })
      }

      // Insert ALL source prices
      const toInsert = sourcePrices.map(p => ({
        customer_id:     targetCustomerId,
        product_id:      p.product_id,
        contract_price:  p.contract_price,
        effective_from:  p.effective_from,
        effective_to:    p.effective_to,
      }))

      const { error: insertErr } = await supabase
        .from('customer_pricing')
        .insert(toInsert)

      if (insertErr) {
        return NextResponse.json({ success: false, error: `Insert failed: ${insertErr.message}` }, { status: 500 })
      }

      added = toInsert.length

    } else {
      // ── MERGE MODE — only add products target doesn't already have ──
      const { data: existingTarget } = await supabase
        .from('customer_pricing')
        .select('product_id')
        .eq('customer_id', targetCustomerId)

      const existingProductIds = new Set((existingTarget || []).map((p: any) => p.product_id))

      const toInsert = sourcePrices
        .filter(p => !existingProductIds.has(p.product_id))
        .map(p => ({
          customer_id:     targetCustomerId,
          product_id:      p.product_id,
          contract_price:  p.contract_price,
          effective_from:  p.effective_from,
          effective_to:    p.effective_to,
        }))

      skipped = sourcePrices.length - toInsert.length

      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from('customer_pricing')
          .insert(toInsert)

        if (insertErr) {
          return NextResponse.json({ success: false, error: `Insert failed: ${insertErr.message}` }, { status: 500 })
        }

        added = toInsert.length
      }
    }

    return NextResponse.json({
      success: true,
      added,
      skipped,
      replaced,
      mode,
    })

  } catch (error: any) {
    console.error('Clone contract pricing error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to clone',
    }, { status: 500 })
  }
}