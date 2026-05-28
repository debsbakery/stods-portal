// app/api/clock/change-pin/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { current_pin, new_pin } = await request.json()

    if (!current_pin || !new_pin) {
      return NextResponse.json({ error: 'Current PIN and new PIN required' }, { status: 400 })
    }

    if (new_pin.length !== 4 || !/^\d{4}$/.test(new_pin)) {
      return NextResponse.json({ error: 'New PIN must be exactly 4 digits' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Find staff by current PIN
    const { data: staff } = await supabase
      .from('staff')
      .select('id, name, pin')
      .eq('pin', current_pin)
      .eq('active', true)
      .maybeSingle()

    if (!staff) {
      return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 401 })
    }

    // Check new PIN isn't already used by someone else
    const { data: existing } = await supabase
      .from('staff')
      .select('id, name')
      .eq('pin', new_pin)
      .eq('active', true)
      .neq('id', staff.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'That PIN is already in use. Please choose a different one.' }, { status: 409 })
    }

    // Update PIN
    const { error: updateError } = await supabase
      .from('staff')
      .update({ pin: new_pin, updated_at: new Date().toISOString() })
      .eq('id', staff.id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update PIN' }, { status: 500 })
    }

    return NextResponse.json({ success: true, name: staff.name })

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to change PIN' }, { status: 500 })
  }
}