// app/admin/staff/new/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth'
import Link from 'next/link'
import StaffForm from '../components/staff-form'

export default async function NewStaffPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        href="/admin/staff"
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        ← Back to Staff
      </Link>
      <h1 className="text-3xl font-bold mb-6">Add Staff Member</h1>
      <StaffForm />
    </div>
  )
}