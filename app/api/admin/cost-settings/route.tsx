import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      labour_pct,
      labour_is_actual,
      labour_notes,
      overhead_per_kg,
      overhead_is_actual,
      overhead_notes,
    } = body

    if (
      typeof labour_pct !== 'number' ||
      typeof overhead_per_kg !== 'number' ||
      labour_pct < 0 ||
      labour_pct > 100 ||
      overhead_per_kg < 0
    ) {
      return NextResponse.json({ error: 'Invalid values' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const today = new Date().toISOString().split('T')[0]

    const upserts = [
      {
        setting_key: 'labour_pct',
        value: labour_pct,
        is_actual: labour_is_actual ?? false,
        effective_date: today,
        notes: labour_notes ?? '',
      },
      {
        setting_key: 'overhead_per_kg',
        value: overhead_per_kg,
        is_actual: overhead_is_actual ?? false,
        effective_date: today,
        notes: overhead_notes ?? '',
      },
    ]

    const { error } = await supabase
      .from('cost_settings')
      .upsert(upserts, { onConflict: 'setting_key' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}