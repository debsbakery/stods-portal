// app/admin/staff/clock-qr/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import QRDisplayClient from './QRDisplayClient'

export default async function ClockQRPage() {
  if (!(await checkAdmin())) redirect('/')

  const supabase = createAdminClient()

  const { data: locations } = await supabase
    .from('staff_locations')
    .select(`
      id, name,
      staff_qr_codes(id, token, active)
    `)
    .eq('active', true)

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">🖨️ Clock-In QR Codes</h1>
        <a href="/admin/staff" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to Staff
        </a>
      </div>
      <p className="text-gray-500 mb-6 text-sm">
        Print and mount this QR code at the bakery. Staff scan it to clock in and out.
        Click Refresh Code if the QR is compromised.
      </p>
      <QRDisplayClient locations={locations ?? []} />
    </div>
  )
}