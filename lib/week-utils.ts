// lib/week-utils.ts
import {
  startOfWeek, endOfWeek, format,
  addWeeks, subWeeks, eachDayOfInterval
} from 'date-fns'

export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 0 }) // 0 = Sunday
}
export function getWeekEnd(date: Date): Date {
  return endOfWeek(date, { weekStartsOn: 0 })
}
export function getWeekDays(weekStart: Date): Date[] {
  return eachDayOfInterval({ start: weekStart, end: getWeekEnd(weekStart) })
}
export function formatWeekStart(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}
export function formatWeekLabel(date: Date): string {
  return `${format(date, 'd MMM')} – ${format(getWeekEnd(date), 'd MMM yyyy')}`
}
export function prevWeek(date: Date): Date { return subWeeks(date, 1) }
export function nextWeek(date: Date): Date { return addWeeks(date, 1) }
export function parseWeekStart(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}