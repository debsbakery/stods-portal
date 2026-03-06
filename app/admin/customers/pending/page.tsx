export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ArrowLeft, Clock, CheckCircle, User, Shield, Mail } from 'lucide-react'
import Link from 'next/link'
import InviteCustomerButton from '@/components/admin/InviteCustomerButton'

export default async function PendingCustomersPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect('/')

  const supabase = createAdminClient()

  // ── 1. Pending approval ───────────────────────────────────────────
  const { data: pending } = await supabase
    .from('customers')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  // ── 2. Active but portal_access = false (never invited) ──────────
  const { data: noPortal } = await supabase
    .from('customers')
    .select('*')
    .eq('status', 'active')
    .eq('portal_access', false)
    .order('business_name', { ascending: true })

  // ── 3. Active + portal_access = true — check who confirmed ───────
  const { data: hasAccess } = await supabase
    .from('customers')
    .select('*')
    .eq('status', 'active')
    .eq('portal_access', true)
    .order('business_name', { ascending: true })

  // Get ALL auth users to check confirmed status
  const { data: authData } = await supabase.auth.admin.listUsers()
  const authUsers = authData?.users ?? []

  // Build map: email (lowercase) -> { confirmed_at, last_sign_in_at }
  const authMap = new Map<string, { confirmed_at: string | null; last_sign_in_at: string | null }>()
  for (const u of authUsers) {
    if (u.email) {
      authMap.set(u.email.toLowerCase(), {
        confirmed_at: u.confirmed_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })
    }
  }

  // Split hasAccess into: invited-but-not-confirmed vs confirmed
  const notConfirmed: any[] = []
  const confirmed:    any[] = []

  for (const c of hasAccess ?? []) {
    const auth = authMap.get(c.email?.toLowerCase() ?? '')
    if (auth?.confirmed_at) {
      confirmed.push({ ...c, last_sign_in_at: auth.last_sign_in_at })
    } else {
      notConfirmed.push(c)
    }
  }

  const pendingCount      = pending?.length     ?? 0
  const noPortalCount     = noPortal?.length    ?? 0
  const notConfirmedCount = notConfirmed.length
  const confirmedCount    = confirmed.length

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        href="/admin"
        className="flex items-center gap-1 text-sm mb-5 hover:opacity-80"
        style={{ color: '#CE1126' }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      {/* ── Summary Badges ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <SummaryBadge label="Pending Approval" count={pendingCount}      color="orange" />
        <SummaryBadge label="Never Invited"    count={noPortalCount}     color="red"    />
        <SummaryBadge label="Invited / Waiting" count={notConfirmedCount} color="blue"   />
        <SummaryBadge label="Portal Active"    count={confirmedCount}    color="green"  />
      </div>

      {/* ── Section 1: Pending Approvals ───────────────────────────── */}
      <SectionHeader
        icon={<Clock className="h-6 w-6 text-orange-500" />}
        title="Pending Approvals"
        count={pendingCount}
        badgeColor="orange"
      />
      {pendingCount === 0 ? (
        <EmptyState message="No pending applications" sub="All caught up!" />
      ) : (
        <div className="space-y-4 mb-8">
          {pending!.map(c => (
            <CustomerCard key={c.id} customer={c} showApprove />
          ))}
        </div>
      )}

      {/* ── Section 2: Never Invited ───────────────────────────────── */}
      <SectionHeader
        icon={<Shield className="h-6 w-6 text-red-500" />}
        title="Never Invited"
        count={noPortalCount}
        badgeColor="red"
        subtitle="Active customers who have never been invited to the portal."
      />
      {noPortalCount === 0 ? (
        <EmptyState message="All active customers have been invited" />
      ) : (
        <div className="space-y-3 mb-8">
          {noPortal!.map(c => (
            <CustomerCard key={c.id} customer={c} showApprove={false} />
          ))}
        </div>
      )}

      {/* ── Section 3: Invited but Not Confirmed ───────────────────── */}
      <SectionHeader
        icon={<Mail className="h-6 w-6 text-blue-500" />}
        title="Invited — Awaiting Confirmation"
        count={notConfirmedCount}
        badgeColor="blue"
        subtitle="These customers received an invite but haven't clicked the link yet. Resend if needed."
      />
      {notConfirmedCount === 0 ? (
        <EmptyState message="No outstanding invites" />
      ) : (
        <div className="space-y-3 mb-8">
          {notConfirmed.map(c => (
            <CustomerCard key={c.id} customer={c} showApprove={false} />
          ))}
        </div>
      )}

      {/* ── Section 4: Confirmed / Active ──────────────────────────── */}
      <SectionHeader
        icon={<CheckCircle className="h-6 w-6 text-green-500" />}
        title="Portal Active"
        count={confirmedCount}
        badgeColor="green"
        subtitle="These customers have confirmed their account and can log in."
      />
      {confirmedCount === 0 ? (
        <EmptyState message="No confirmed portal users yet" />
      ) : (
        <div className="space-y-3">
          {confirmed.map(c => (
            <CustomerCard
              key={c.id}
              customer={c}
              showApprove={false}
              showLastLogin
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Summary Badge ──────────────────────────────────────────────────────────
function SummaryBadge({
  label, count, color,
}: {
  label: string; count: number; color: 'orange' | 'red' | 'blue' | 'green'
}) {
  const styles = {
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red:    'bg-red-50 border-red-200 text-red-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
  }
  return (
    <div className={`rounded-lg border p-4 text-center ${styles[color]}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs font-medium mt-1">{label}</p>
    </div>
  )
}

// ── Section Header ─────────────────────────────────────────────────────────
function SectionHeader({
  icon, title, count, badgeColor, subtitle,
}: {
  icon: React.ReactNode
  title: string
  count: number
  badgeColor: 'orange' | 'red' | 'blue' | 'green'
  subtitle?: string
}) {
  const badgeStyles = {
    orange: 'bg-orange-100 text-orange-700',
    red:    'bg-red-100 text-red-700',
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-green-100 text-green-700',
  }
  return (
    <div className="mt-8 mb-4">
      <div className="flex items-center gap-3">
        {icon}
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        {count > 0 && (
          <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${badgeStyles[badgeColor]}`}>
            {count}
          </span>
        )}
      </div>
      {subtitle && <p className="text-sm text-gray-500 mt-1 ml-9">{subtitle}</p>}
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────────────────
function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border p-6 text-center mb-8">
      <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
      <p className="text-gray-500 font-medium">{message}</p>
      {sub && <p className="text-gray-400 text-sm mt-1">{sub}</p>}
    </div>
  )
}

// ── Customer Card ──────────────────────────────────────────────────────────
function CustomerCard({
  customer,
  showApprove,
  showLastLogin = false,
}: {
  customer: any
  showApprove: boolean
  showLastLogin?: boolean
}) {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{customer.business_name}</h3>
            <p className="text-sm text-gray-500">{customer.contact_name}</p>
            <p className="text-sm text-gray-500">{customer.email}</p>
            {customer.phone && (
              <p className="text-sm text-gray-500">{customer.phone}</p>
            )}
            {customer.address && (
              <p className="text-sm text-gray-400 mt-1">{customer.address}</p>
            )}
            {customer.delivery_notes && (
              <p className="text-xs text-blue-600 mt-1 italic">
                Notes: {customer.delivery_notes}
              </p>
            )}
            {showLastLogin && customer.last_sign_in_at && (
              <p className="text-xs text-green-600 mt-1 font-medium">
                Last login: {new Date(customer.last_sign_in_at).toLocaleString('en-AU')}
              </p>
            )}
            <p className="text-xs text-gray-300 mt-1">
              Added: {new Date(customer.created_at).toLocaleString('en-AU')}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {showApprove && (
            <form action={`/api/admin/customers/${customer.id}/approve`} method="POST">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 w-full justify-center"
                style={{ backgroundColor: '#006A4E' }}
              >
                <CheckCircle className="h-4 w-4" /> Approve
              </button>
            </form>
          )}

          <InviteCustomerButton
            customerId={customer.id}
            customerEmail={customer.email ?? null}
            portalAccess={customer.portal_access ?? false}
          />

          {showApprove && (
            <form action={`/api/admin/customers/${customer.id}/decline`} method="POST">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg bg-red-500 hover:bg-red-600 w-full justify-center"
              >
                Decline
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}