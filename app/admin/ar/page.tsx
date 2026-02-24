export const dynamic = 'force-dynamic'

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { formatCurrency } from "@/lib/utils"
import { checkAdmin } from "@/lib/auth"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

async function getARSummary() {
  const supabase = await createClient()

  const { data: arSummary, error } = await supabase
    .from('customer_ar_summary')
    .select('*')
    .order('total_due', { ascending: false })

  if (error) {
    console.error('Error fetching AR summary:', error)
    return []
  }

  return arSummary || []
}

export default async function ARSummaryPage() {
  const isAdmin = await checkAdmin()
  if (!isAdmin) redirect("/")

  const arSummary = await getARSummary()

  const totals = arSummary.reduce(
    (acc, customer) => ({
      current: acc.current + parseFloat(customer.current || '0'),
      days_1_30: acc.days_1_30 + parseFloat(customer.days_1_30 || '0'),
      days_31_60: acc.days_31_60 + parseFloat(customer.days_31_60 || '0'),
      days_61_90: acc.days_61_90 + parseFloat(customer.days_61_90 || '0'),
      days_over_90: acc.days_over_90 + parseFloat(customer.days_over_90 || '0'),
      total_due: acc.total_due + parseFloat(customer.total_due || '0'),
    }),
    { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0, total_due: 0 }
  )

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
        <h1 className="text-3xl font-bold" style={{ color: "#006A4E" }}>
          Accounts Receivable
        </h1>
        <p className="text-gray-600 mt-2">
          Aging summary for all customers
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: "#006A4E" }}>
          <p className="text-xs text-gray-600">Current</p>
          <p className="text-xl font-bold" style={{ color: "#006A4E" }}>
            {formatCurrency(totals.current)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: "#FFD700" }}>
          <p className="text-xs text-gray-600">1-30 Days</p>
          <p className="text-xl font-bold" style={{ color: "#FFD700" }}>
            {formatCurrency(totals.days_1_30)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: "#FFA500" }}>
          <p className="text-xs text-gray-600">31-60 Days</p>
          <p className="text-xl font-bold" style={{ color: "#FFA500" }}>
            {formatCurrency(totals.days_31_60)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: "#FF6347" }}>
          <p className="text-xs text-gray-600">61-90 Days</p>
          <p className="text-xl font-bold" style={{ color: "#FF6347" }}>
            {formatCurrency(totals.days_61_90)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: "#CE1126" }}>
          <p className="text-xs text-gray-600">Over 90 Days</p>
          <p className="text-xl font-bold" style={{ color: "#CE1126" }}>
            {formatCurrency(totals.days_over_90)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-gray-800">
          <p className="text-xs text-gray-600">Total AR</p>
          <p className="text-xl font-bold text-gray-800">
            {formatCurrency(totals.total_due)}
          </p>
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Customer Aging Detail</h2>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">1-30 Days</TableHead>
                <TableHead className="text-right">31-60 Days</TableHead>
                <TableHead className="text-right">61-90 Days</TableHead>
                <TableHead className="text-right">Over 90</TableHead>
                <TableHead className="text-right">Total Balance</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {arSummary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    No customer balances found
                  </TableCell>
                </TableRow>
              ) : (
                arSummary.map((customer) => {
                  const total = parseFloat(customer.total_due || '0')
                  const hasBalance = total > 0

                  return (
                    <TableRow key={customer.customer_id} className={hasBalance ? "" : "opacity-50"}>
                      <TableCell className="font-medium">
                        {customer.business_name || customer.email}
                      </TableCell>

                      <TableCell className="text-right text-green-600">
                        {formatCurrency(parseFloat(customer.current || '0'))}
                      </TableCell>

                      <TableCell className="text-right text-yellow-600">
                        {formatCurrency(parseFloat(customer.days_1_30 || '0'))}
                      </TableCell>

                      <TableCell className="text-right text-orange-600">
                        {formatCurrency(parseFloat(customer.days_31_60 || '0'))}
                      </TableCell>

                      <TableCell className="text-right text-red-500">
                        {formatCurrency(parseFloat(customer.days_61_90 || '0'))}
                      </TableCell>

                      <TableCell className="text-right font-bold text-red-700">
                        {formatCurrency(parseFloat(customer.days_over_90 || '0'))}
                      </TableCell>

                      <TableCell className="text-right font-bold">
                        {formatCurrency(total)}
                      </TableCell>

                      <TableCell className="text-center">
                        <Link
                          href={`/admin/ar/${customer.customer_id}`}
                          className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium hover:opacity-80"
                          style={{ 
                            backgroundColor: hasBalance ? "#006A4E" : "#9CA3AF",
                            color: "white" 
                          }}
                        >
                          View Ledger
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
        <p className="font-semibold mb-2">💡 AR Aging Explained:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Current:</strong> Invoices not yet due</li>
          <li><strong>1-30 Days:</strong> Overdue 1-30 days</li>
          <li><strong>31-60 Days:</strong> Overdue 31-60 days</li>
          <li><strong>61-90 Days:</strong> Overdue 61-90 days</li>
          <li><strong>Over 90 Days:</strong> Seriously overdue (requires attention)</li>
        </ul>
      </div>
    </div>
  )
}