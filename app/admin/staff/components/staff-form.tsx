// app/admin/staff/components/staff-form.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const DEPARTMENTS = [
  { value: 'production', label: '🍞 Production' },
  { value: 'shop',       label: '🛒 Shop' },
  { value: 'delivery',   label: '🚚 Delivery' },
  { value: 'admin',      label: '📋 Admin' },
  { value: 'management', label: '👔 Management' },
]

const EMPLOYMENT_TYPES = [
  { value: 'casual',      label: 'Casual — clock in/out only' },
  { value: 'fixed_start', label: 'Fixed Start — set start, finish when done' },
  { value: 'fixed',       label: 'Fixed — set start AND finish' },
  { value: 'salary',      label: 'Salary — presence indicator only' },
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface StaffFormProps {
  staff?:     any
  isEditing?: boolean
}

// ── Weekly Template Sub-component ─────────────────────────────────────────────
function WeeklyTemplateSection({
  staffId,
  employmentType,
  isEditing,
}: {
  staffId?:       string
  employmentType: string
  isEditing:      boolean
}) {
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)
  const [localTemplates, setLocalTemplates] = useState(
    DAY_NAMES.map((_, i) => ({
      day_of_week:     i,
      is_working_day:  i >= 1 && i <= 5,   // Mon–Fri default
      scheduled_start: '06:00',
      scheduled_end:   '14:00',
    }))
  )

  // Load existing templates when editing
  useEffect(() => {
    if (!isEditing || !staffId) return
    fetch(`/api/admin/staff/${staffId}/templates`)
      .then(r => r.json())
      .then(data => {
        if (data.templates?.length > 0) {
          const updated = DAY_NAMES.map((_, i) => {
            const t = data.templates.find((x: any) => x.day_of_week === i)
            return {
              day_of_week:     i,
              is_working_day:  !!t,
              scheduled_start: t?.scheduled_start?.slice(0, 5) ?? '06:00',
              scheduled_end:   t?.scheduled_end?.slice(0, 5)   ?? '14:00',
            }
          })
          setLocalTemplates(updated)
        }
      })
      .catch(() => {})
  }, [staffId, isEditing])

  function updateTemplate(dayIdx: number, field: string, value: any) {
    setLocalTemplates(prev => prev.map((t, i) =>
      i === dayIdx ? { ...t, [field]: value } : t
    ))
  }

  async function saveTemplates() {
    if (!staffId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/staff/${staffId}/templates`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ templates: localTemplates }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch (e) {
      console.error('Template save failed', e)
    } finally {
      setSaving(false)
    }
  }

  const tinp = "px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-amber-500 w-20"

  if (employmentType === 'salary') {
    return (
      <div className="pt-5 border-t border-gray-100">
        <p className="text-sm font-semibold text-gray-700 mb-2">📅 Weekly Template</p>
        <p className="text-sm text-gray-400">
          Salary staff — clock-in records presence only. No template schedule needed.
        </p>
      </div>
    )
  }

  return (
    <div className="pt-5 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-700">📅 Weekly Template Schedule</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Used when generating rosters and copying weeks
          </p>
        </div>
        {isEditing && (
          <button
            type="button"
            onClick={saveTemplates}
            disabled={saving}
            className="px-3 py-1.5 bg-amber-700 text-white rounded text-xs font-medium
                       hover:bg-amber-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : saved ? '✅ Saved' : 'Save Template'}
          </button>
        )}
      </div>

      {!isEditing && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          ⚠️ Save the staff member first, then set their weekly template here.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-14">Day</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Working?</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Start</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Finish</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Est. Hours</th>
            </tr>
          </thead>
          <tbody>
            {localTemplates.map((t, i) => {
              // Estimate hours for this day
              let estHours = ''
              if (t.is_working_day && t.scheduled_start && t.scheduled_end) {
                const [sh, sm] = t.scheduled_start.split(':').map(Number)
                const [eh, em] = t.scheduled_end.split(':').map(Number)
                const gross    = (eh * 60 + em) - (sh * 60 + sm)
                if (gross > 0) estHours = `${(gross / 60).toFixed(1)}h`
              }

              return (
                <tr
                  key={i}
                  className={`border-t transition-opacity ${
                    !t.is_working_day ? 'opacity-40 bg-gray-50' : 'bg-white'
                  }`}
                >
                  <td className="px-3 py-2 font-semibold text-gray-700">
                    {DAY_NAMES[i]}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <label className="flex items-center justify-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={t.is_working_day}
                        disabled={!isEditing}
                        onChange={e => updateTemplate(i, 'is_working_day', e.target.checked)}
                        className="w-4 h-4 accent-amber-700 cursor-pointer"
                      />
                      <span className={`text-xs ${t.is_working_day ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                        {t.is_working_day ? 'Yes' : 'Off'}
                      </span>
                    </label>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="time"
                      value={t.scheduled_start}
                      disabled={!isEditing || !t.is_working_day}
                      onChange={e => updateTemplate(i, 'scheduled_start', e.target.value)}
                      className={`${tinp} ${(!isEditing || !t.is_working_day) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {employmentType === 'fixed_start' ? (
                      <span className="text-gray-400 text-xs italic">open end</span>
                    ) : (
                      <input
                        type="time"
                        value={t.scheduled_end}
                        disabled={!isEditing || !t.is_working_day}
                        onChange={e => updateTemplate(i, 'scheduled_end', e.target.value)}
                        className={`${tinp} ${(!isEditing || !t.is_working_day) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs font-medium ${estHours ? 'text-amber-700' : 'text-gray-300'}`}>
                      {estHours || '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {/* Weekly total */}
          <tfoot>
            <tr className="bg-gray-50 border-t-2">
              <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">
                Weekly total:
              </td>
              <td className="px-3 py-2 text-center">
                <span className="text-xs font-bold text-amber-800">
                  {(() => {
                    const total = localTemplates.reduce((sum, t) => {
                      if (!t.is_working_day || !t.scheduled_start || !t.scheduled_end) return sum
                      const [sh, sm] = t.scheduled_start.split(':').map(Number)
                      const [eh, em] = t.scheduled_end.split(':').map(Number)
                      const gross = (eh * 60 + em) - (sh * 60 + sm)
                      return sum + Math.max(0, gross)
                    }, 0)
                    return total > 0 ? `${(total / 60).toFixed(1)}h` : '—'
                  })()}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Main Staff Form ───────────────────────────────────────────────────────────
export default function StaffForm({ staff, isEditing = false }: StaffFormProps) {
  const router = useRouter()
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState('')
  const [changeReason, setChangeReason] = useState('')

  const [form, setForm] = useState({
    name:                        staff?.name                        ?? '',
    pin:                         staff?.pin                         ?? '',
    role:                        staff?.role                        ?? 'staff',
    employment_type:             staff?.employment_type             ?? 'casual',
    primary_department:          staff?.primary_department          ?? 'production',
    secondary_department:        staff?.secondary_department        ?? '',
    cost_centre:                 staff?.cost_centre                 ?? '',
    base_hourly_rate:            staff?.base_hourly_rate            ?? '',
    saturday_rate:               staff?.saturday_rate               ?? '',
    sunday_rate:                 staff?.sunday_rate                 ?? '',
    public_holiday_rate:         staff?.public_holiday_rate         ?? '',
    public_holiday_multiplier:   staff?.public_holiday_multiplier   ?? '2.0',
    overtime_threshold_hours:    staff?.overtime_threshold_hours    ?? '',
    overtime_multiplier:         staff?.overtime_multiplier         ?? '1.5',
    double_time_threshold_hours: staff?.double_time_threshold_hours ?? '',
    double_time_multiplier:      staff?.double_time_multiplier      ?? '2.0',
    salary_weekly:               staff?.salary_weekly               ?? '',
    salary_annual:               staff?.salary_annual               ?? '',
    salary_hours_per_week:       staff?.salary_hours_per_week       ?? '38',
    annual_leave_hours_per_year: staff?.annual_leave_hours_per_year ?? '152',
    sick_leave_hours_per_year:   staff?.sick_leave_hours_per_year   ?? '76',
    leave_loading_percent:       staff?.leave_loading_percent       ?? '17.5',
    super_rate_percent:          staff?.super_rate_percent          ?? '11.5',
    break_minutes:               staff?.break_minutes               ?? '30',
    tax_file_number:             staff?.tax_file_number             ?? '',
    start_date:                  staff?.start_date                  ?? '',
    active:                      staff?.active                      ?? true,
  })

  const set = (field: string, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const isSalary = form.employment_type === 'salary'
  const isHourly = !isSalary

  function computePreview(): string {
    if (isSalary) {
      const weekly = Number(form.salary_weekly  || 0)
      const hrs    = Number(form.salary_hours_per_week || 38)
      const hourly = hrs > 0 ? weekly / hrs : 0
      const superC = hourly * (Number(form.super_rate_percent || 11.5) / 100)
      const leaveH = (Number(form.annual_leave_hours_per_year || 152) / 52) / hrs
      const leaveL = hourly * leaveH * (Number(form.leave_loading_percent || 17.5) / 100)
      return (hourly + superC + leaveL).toFixed(2)
    }
    const base   = Number(form.base_hourly_rate || 0)
    const superC = base * (Number(form.super_rate_percent || 11.5) / 100)
    const leaveH = (Number(form.annual_leave_hours_per_year || 152) / 52) / 38
    const leaveL = base * leaveH * (Number(form.leave_loading_percent || 17.5) / 100)
    return (base + superC + leaveL).toFixed(2)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const url    = isEditing ? `/api/admin/staff/${staff.id}` : '/api/admin/staff'
      const method = isEditing ? 'PUT' : 'POST'

      const payload = {
        ...form,
        secondary_department:        form.secondary_department        || null,
        cost_centre:                 form.cost_centre                 || null,
        base_hourly_rate:            form.base_hourly_rate            ? Number(form.base_hourly_rate)            : null,
        saturday_rate:               form.saturday_rate               ? Number(form.saturday_rate)               : null,
        sunday_rate:                 form.sunday_rate                 ? Number(form.sunday_rate)                 : null,
        public_holiday_rate:         form.public_holiday_rate         ? Number(form.public_holiday_rate)         : null,
        public_holiday_multiplier:   Number(form.public_holiday_multiplier   || 2.0),
        overtime_threshold_hours:    form.overtime_threshold_hours    ? Number(form.overtime_threshold_hours)    : null,
        overtime_multiplier:         Number(form.overtime_multiplier  || 1.5),
        double_time_threshold_hours: form.double_time_threshold_hours ? Number(form.double_time_threshold_hours) : null,
        double_time_multiplier:      Number(form.double_time_multiplier || 2.0),
        salary_weekly:               form.salary_weekly               ? Number(form.salary_weekly)               : null,
        salary_annual:               form.salary_annual               ? Number(form.salary_annual)               : null,
        salary_hours_per_week:       Number(form.salary_hours_per_week || 38),
        annual_leave_hours_per_year: Number(form.annual_leave_hours_per_year || 152),
        sick_leave_hours_per_year:   Number(form.sick_leave_hours_per_year || 76),
        leave_loading_percent:       Number(form.leave_loading_percent || 17.5),
        super_rate_percent:          Number(form.super_rate_percent || 11.5),
        break_minutes:               Number(form.break_minutes || 30),
        tax_file_number:             form.tax_file_number || null,
        start_date:                  form.start_date || null,
        change_reason:               changeReason || 'rate_update',
      }

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Save failed')

      setSuccess(
        data.rate_changed
          ? '✅ Staff updated — pay rate change logged to history'
          : isEditing ? '✅ Staff updated' : '✅ Staff member added'
      )

      setTimeout(() => router.push('/admin/staff'), 1500)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500"
  const lbl = "block text-sm font-medium text-gray-700 mb-1"
  const sec = "pt-5 border-t border-gray-100"

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-5 max-w-3xl">

      {error   && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">{success}</div>}

      {/* ── Identity ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Full Name <span className="text-red-500">*</span></label>
          <input
            type="text" required value={form.name}
            onChange={e => set('name', e.target.value)}
            className={inp} placeholder="Jane Smith"
          />
        </div>
        <div>
          <label className={lbl}>4-Digit PIN <span className="text-red-500">*</span></label>
          <input
            type="password" required maxLength={4} minLength={4} value={form.pin}
            onChange={e => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
            className={inp} placeholder="••••"
          />
          <p className="text-xs text-gray-400 mt-1">Used for clock-in kiosk</p>
        </div>
      </div>

      {/* ── Role + Employment Type ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Role</label>
          <select value={form.role} onChange={e => set('role', e.target.value)} className={inp}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Employment Type <span className="text-red-500">*</span></label>
          <select
            value={form.employment_type}
            onChange={e => set('employment_type', e.target.value)}
            className={inp}
          >
            {EMPLOYMENT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Department ── */}
      <div className={sec}>
        <p className="text-sm font-semibold text-gray-700 mb-3">🏭 Department</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={lbl}>Primary Department <span className="text-red-500">*</span></label>
            <select
              value={form.primary_department}
              onChange={e => set('primary_department', e.target.value)}
              className={inp}
            >
              {DEPARTMENTS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>
              Secondary Department
              <span className="ml-1 text-xs text-gray-400">(split shifts)</span>
            </label>
            <select
              value={form.secondary_department}
              onChange={e => set('secondary_department', e.target.value)}
              className={inp}
            >
              <option value="">None</option>
              {DEPARTMENTS.filter(d => d.value !== form.primary_department).map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Cost Centre / GL Code</label>
            <input
              type="text" value={form.cost_centre}
              onChange={e => set('cost_centre', e.target.value)}
              className={inp} placeholder="PROD-001"
            />
          </div>
        </div>
      </div>

      {/* ── Pay Rates — Hourly ── */}
      {isHourly && (
        <div className={sec}>
          <p className="text-sm font-semibold text-gray-700 mb-3">💰 Pay Rates (Hourly)</p>

          {/* Base rates grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={lbl}>Base Rate/hr <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number" step="0.01" min="0" value={form.base_hourly_rate}
                  onChange={e => set('base_hourly_rate', e.target.value)}
                  className={`${inp} pl-7`} placeholder="25.00"
                />
              </div>
            </div>
            <div>
              <label className={lbl}>Saturday Rate/hr</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number" step="0.01" min="0" value={form.saturday_rate}
                  onChange={e => set('saturday_rate', e.target.value)}
                  className={`${inp} pl-7`} placeholder="31.25"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Blank = use base rate</p>
            </div>
            <div>
              <label className={lbl}>Sunday Rate/hr</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number" step="0.01" min="0" value={form.sunday_rate}
                  onChange={e => set('sunday_rate', e.target.value)}
                  className={`${inp} pl-7`} placeholder="37.50"
                />
              </div>
            </div>
            <div>
              <label className={lbl}>Public Holiday Rate/hr</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number" step="0.01" min="0" value={form.public_holiday_rate}
                  onChange={e => set('public_holiday_rate', e.target.value)}
                  className={`${inp} pl-7`} placeholder="50.00"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Blank = base × multiplier</p>
            </div>
          </div>

          {/* Overtime grid */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={lbl}>OT Threshold (hrs)</label>
              <input
                type="number" step="0.5" min="0" value={form.overtime_threshold_hours}
                onChange={e => set('overtime_threshold_hours', e.target.value)}
                className={inp} placeholder="8"
              />
              <p className="text-xs text-gray-400 mt-1">Blank = no overtime</p>
            </div>
            <div>
              <label className={lbl}>OT Multiplier</label>
              <input
                type="number" step="0.25" min="1" value={form.overtime_multiplier}
                onChange={e => set('overtime_multiplier', e.target.value)}
                className={inp} placeholder="1.5"
              />
            </div>
            <div>
              <label className={lbl}>Double Time (hrs)</label>
              <input
                type="number" step="0.5" min="0" value={form.double_time_threshold_hours}
                onChange={e => set('double_time_threshold_hours', e.target.value)}
                className={inp} placeholder="10"
              />
              <p className="text-xs text-gray-400 mt-1">Blank = no double time</p>
            </div>
            <div>
              <label className={lbl}>DT Multiplier</label>
              <input
                type="number" step="0.25" min="1" value={form.double_time_multiplier}
                onChange={e => set('double_time_multiplier', e.target.value)}
                className={inp} placeholder="2.0"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Pay Rates — Salary ── */}
      {isSalary && (
        <div className={sec}>
          <p className="text-sm font-semibold text-gray-700 mb-3">💰 Salary</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Weekly Salary</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number" step="0.01" min="0" value={form.salary_weekly}
                  onChange={e => set('salary_weekly', e.target.value)}
                  className={`${inp} pl-7`} placeholder="1500.00"
                />
              </div>
            </div>
            <div>
              <label className={lbl}>Annual Salary</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number" step="100" min="0" value={form.salary_annual}
                  onChange={e => set('salary_annual', e.target.value)}
                  className={`${inp} pl-7`} placeholder="75000"
                />
              </div>
            </div>
            <div>
              <label className={lbl}>Contracted Hours/Week</label>
              <input
                type="number" step="0.5" min="1" max="60" value={form.salary_hours_per_week}
                onChange={e => set('salary_hours_per_week', e.target.value)}
                className={inp} placeholder="38"
              />
            </div>
          </div>
          <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded text-xs text-purple-700">
            🕐 <strong>Salary staff</strong> — clock-in records presence only.
            No pay is calculated from hours worked.
          </div>
        </div>
      )}

      {/* ── On-costs + Super ── */}
      <div className={sec}>
        <p className="text-sm font-semibold text-gray-700 mb-3">📊 On-Costs & Superannuation</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className={lbl}>Super Rate %</label>
            <input
              type="number" step="0.5" min="0" max="30" value={form.super_rate_percent}
              onChange={e => set('super_rate_percent', e.target.value)}
              className={inp} placeholder="11.5"
            />
          </div>
          <div>
            <label className={lbl}>Leave Loading %</label>
            <input
              type="number" step="0.5" min="0" value={form.leave_loading_percent}
              onChange={e => set('leave_loading_percent', e.target.value)}
              className={inp} placeholder="17.5"
            />
          </div>
          <div>
            <label className={lbl}>Annual Leave Hrs/yr</label>
            <input
              type="number" step="1" min="0" value={form.annual_leave_hours_per_year}
              onChange={e => set('annual_leave_hours_per_year', e.target.value)}
              className={inp} placeholder="152"
            />
          </div>
          <div>
            <label className={lbl}>PH Multiplier</label>
            <input
              type="number" step="0.25" min="1" value={form.public_holiday_multiplier}
              onChange={e => set('public_holiday_multiplier', e.target.value)}
              className={inp} placeholder="2.0"
            />
            <p className="text-xs text-gray-400 mt-1">Used if no PH rate set</p>
          </div>
        </div>

        {/* True cost preview */}
        {(form.base_hourly_rate || form.salary_weekly) && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
            <span className="text-amber-700">
              💡 Estimated true hourly cost (incl. super + leave loading):
              <strong className="ml-2 text-amber-900">${computePreview()}/hr</strong>
            </span>
          </div>
        )}
      </div>

      {/* ── Work Settings ── */}
      <div className={sec}>
        <p className="text-sm font-semibold text-gray-700 mb-3">⚙️ Work Settings</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className={lbl}>Break Deduction</label>
            <select
              value={String(form.break_minutes)}
              onChange={e => set('break_minutes', e.target.value)}
              className={inp}
            >
              <option value="0">No break</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Start Date</label>
            <input
              type="date" value={form.start_date}
              onChange={e => set('start_date', e.target.value)}
              className={inp}
            />
          </div>
          <div>
            <label className={lbl}>Tax File Number</label>
            <input
              type="text" value={form.tax_file_number}
              onChange={e => set('tax_file_number', e.target.value)}
              className={inp} placeholder="123 456 789"
            />
          </div>
          {isEditing && (
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.active)}
                  onChange={e => set('active', e.target.checked)}
                  className="w-4 h-4 accent-green-600"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* ── Weekly Template Schedule ── */}
      <WeeklyTemplateSection
        staffId={staff?.id}
        employmentType={form.employment_type}
        isEditing={isEditing}
      />

      {/* ── Rate change reason (edit only) ── */}
      {isEditing && (
        <div className={sec}>
          <label className={lbl}>
            Reason for Rate Change
            <span className="ml-2 text-xs font-normal text-gray-400">
              (only logged if pay rates changed)
            </span>
          </label>
          <input
            type="text" value={changeReason}
            onChange={e => setChangeReason(e.target.value)}
            className={inp}
            placeholder="Annual review, award increase, promotion..."
          />
        </div>
      )}

      {/* ── Buttons ── */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold
                     hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed
                     transition-colors"
        >
          {saving ? 'Saving...' : isEditing ? 'Update Staff Member' : 'Add Staff Member'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>

    </form>
  )
}