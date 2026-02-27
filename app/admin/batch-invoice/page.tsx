export const dynamic = 'force-dynamic'

import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { checkAdmin } from "@/lib/auth"
import { ArrowLeft, FileText, Download } from "lucide-react"
import Link from "next/link"
import BatchInvoiceGenerator from "@/components/admin/BatchInvoiceGenerator"

export default async function BatchInvoicePage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect("/")

const supabase = await createServiceClient()
  // Get recent orders for date selection
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('delivery_date')
    .order('delivery_date', { ascending: false })
    .limit(30)

  // Get unique dates
  const uniqueDates = Array.from(
    new Set(recentOrders?.map(o => o.delivery_date) || [])
  ).sort().reverse()

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        href="/admin"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: "#CE1126" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3" style={{ color: "#006A4E" }}>
          <FileText className="h-8 w-8" />
          Batch Invoice Generator
        </h1>
        <p className="text-gray-600 mt-2">
          Generate invoices for multiple orders at once
        </p>
      </div>

      {/* Batch Invoice Component */}
      <BatchInvoiceGenerator availableDates={uniqueDates} />

      {/* Instructions */}
      <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Download className="h-5 w-5" />
          How to use Batch Invoice Generator
        </h3>
        <ul className="list-disc list-inside space-y-2 text-sm text-blue-800">
          <li>Select a delivery date to generate invoices for all orders on that day</li>
          <li>OR select individual orders from the list</li>
          <li>Invoices will be generated as a ZIP file for easy download</li>
          <li>Each invoice will be named: <code>invoice-[customer]-[order-id].pdf</code></li>
          <li>You can then email or print the invoices as needed</li>
        </ul>
      </div>
    </div>
  )
}