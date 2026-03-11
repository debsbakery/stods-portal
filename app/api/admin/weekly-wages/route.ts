import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { week_start, wages } = await request.json()

    if (!week_start) {
      return NextResponse.json({ error: 'week_start required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('weekly_wages')
      .upsert({
        week_start,
        wages: Number(wages) || 0,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'week_start',
      })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}