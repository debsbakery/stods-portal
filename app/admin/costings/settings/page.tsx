export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import CostSettingsView from './cost-settings-view'

export default async function CostSettingsPage() {
  const supabase = createAdminClient()

  const { data: settings, error } = await supabase
    .from('cost_settings')
    .select('*')

  if (error) {
    return (
      <div className="text-red-600 p-4">
        Failed to load cost settings: {error.message}
      </div>
    )
  }

  const settingsMap: Record<string, { value: number; is_actual: boolean; notes: string }> = {}
  for (const row of settings ?? []) {
    settingsMap[row.setting_key] = {
      value: parseFloat(row.value),
      is_actual: row.is_actual ?? false,
      notes: row.notes ?? '',
    }
  }

  return (
    <CostSettingsView
      labourPct={settingsMap['labour_pct']?.value ?? 30}
      labourIsActual={settingsMap['labour_pct']?.is_actual ?? false}
      labourNotes={settingsMap['labour_pct']?.notes ?? ''}
      overheadPerKg={settingsMap['overhead_per_kg']?.value ?? 30}
      overheadIsActual={settingsMap['overhead_per_kg']?.is_actual ?? false}
      overheadNotes={settingsMap['overhead_per_kg']?.notes ?? ''}
    />
  )
}