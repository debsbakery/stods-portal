// app/admin/roster/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import RosterGrid from './components/roster-grid'

// ── UTC-safe date helpers (no local timezone can shift these) ──────────────
// Add days to a YYYY-MM-DD string and return YYYY-MM-DD
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().split('T')[0]
}

function getPreviousSunday(offset = 0): string {
  // Today's date in Brisbane as a plain YYYY-MM-DD
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const [y, m, d] = todayStr.split('-').map(Number)
  // Build as UTC so getUTCDay() is deterministic
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = dt.getUTCDay()  // 0 = Sunday
  dt.setUTCDate(dt.getUTCDate() - day + (offset * 7))
  return dt.toISOString().split('T')[0]
}

export default async function RosterPage({
  searchParams,
}: {
  searchParams: { week?: string }
}) {
  if (!(await checkAdmin())) redirect('/')

  const weekStart = searchParams.week ?? getPreviousSunday()
  const supabase  = createAdminClient()

  // Build week dates — UTC-safe, Monday can never become Sunday
  const weekDates: string[] = []
  for (let i = 0; i < 7; i++) {
    weekDates.push(addDays(weekStart, i))
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
  // Prev/next week — UTC-safe
  const prevSunday = addDays(weekStart, -7)
  const nextSunday = addDays(weekStart, 7)

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