// app/admin/roster/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import RosterGrid from './components/roster-grid'

function getPreviousSunday(offset = 0): string {
  const brisbane = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' })
  )
  brisbane.setHours(0, 0, 0, 0)
  const day = brisbane.getDay()
  brisbane.setDate(brisbane.getDate() - day + (offset * 7))
  return brisbane.toISOString().split('T')[0]
}

export default async function RosterPage({
  searchParams,
}: {
  searchParams: { week?: string }
}) {
  if (!(await checkAdmin())) redirect('/')

  const weekStart = searchParams.week ?? getPreviousSunday()
  const supabase  = createAdminClient()

  // Build week dates
  const weekDates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + i)
    weekDates.push(d.toISOString().split('T')[0])
  }

  // Fetch staff
  const { data: staff } = await supabase
    .from('staff')
    .select('id, name, employment_type, primary_department, secondary_department, break_minutes, base_hourly_rate, salary_weekly, true_hourly_cost')
    .eq('active', true)
    .order('primary_department, name')

  // Fetch entries for this week
  const { data: entries } = await supabase
    .from('roster_entries')
    .select('*')
    .in('work_date', weekDates)
  // Fetch actual clock data for this week
  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, staff_id, work_date, section, effective_start, effective_end, arrived_late_min, left_early_min, status, paid_hours, gross_pay')
    .in('work_date', weekDates)
  // Prev/next week
  const prevSunday = (() => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })()
  const nextSunday = (() => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })()

    return (
    <RosterGrid
      staff={staff ?? []}
      entries={entries ?? []}
      shifts={shifts ?? []}
      weekStart={weekStart}
      weekDates={weekDates}
      prevWeek={prevSunday}
      nextWeek={nextSunday}
    />
  )
}