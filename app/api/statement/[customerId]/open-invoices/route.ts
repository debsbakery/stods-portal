// app/api/statement/[customerId]/open-invoices/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateOpenInvoicesPDF } from '@/lib/pdf/open-invoices'

interface RouteParams {
  params: Promise<{ customerId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createAdminClient()
    const { customerId } = await params

    const { data: customer } = await supabase
      .from('customers')
      .select('id, business_name, contact_name, email, address, balance, payment_terms')
      .eq('id', customerId)
      .single()

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const { data: arTx, error } = await supabase
      .from('ar_transactions')
      .select('id, type, amount, amount_paid, description, created_at, invoice_id, due_date')
      .eq('customer_id', customerId)
      .eq('type', 'invoice')
      .order('due_date', { ascending: true })

    if (error) throw error

    // ✅ Fix — look up by order_id not id
    const invoiceIds = (arTx ?? [])
      .filter(t => t.invoice_id)
      .map(t => t.invoice_id as string)

    let invoiceMap: Record<string, string> = {}
    if (invoiceIds.length > 0) {
      const { data: invNums } = await supabase
        .from('invoice_numbers')
        .select('order_id, invoice_number')
        .in('order_id', invoiceIds)
      for (const inv of invNums ?? []) {
        if (inv.order_id) invoiceMap[inv.order_id] = String(inv.invoice_number)
      }
      // Fallback to orders table
      const missing = invoiceIds.filter(id => !invoiceMap[id])
      if (missing.length > 0) {
        const { data: ordersWithInv } = await supabase
          .from('orders')
          .select('id, invoice_number')
          .in('id', missing)
        for (const o of ordersWithInv ?? []) {
          if (o.invoice_number) invoiceMap[o.id] = String(o.invoice_number)
        }
      }
    }

    const openInvoices = (arTx ?? [])
      .map(tx => {
        const amount      = Number(tx.amount)
        const amountPaid  = Number(tx.amount_paid || 0)
        const outstanding = Math.max(amount - amountPaid, 0)
        const invoiceNum  = tx.invoice_id ? invoiceMap[tx.invoice_id] : null
        const reference   = invoiceNum
          ? `INV-${String(invoiceNum).padStart(4, '0')}`
          : 'INVOICE'

        return {
          date:        tx.created_at,
          due_date:    tx.due_date,
          reference,
          invoice_number: invoiceNum ? Number(invoiceNum) : null,
          description: tx.description || reference,
          amount,
          amount_paid:  amountPaid,
          outstanding,
           status: (amountPaid >= amount - 0.01
            ? 'paid'
            : amountPaid > 0
              ? 'partial'
              : 'unpaid') as 'paid' | 'partial' | 'unpaid',
        }
      })
      .filter(inv => inv.status !== 'paid')

    const totalOutstanding = openInvoices.reduce((s, inv) => s + inv.outstanding, 0)

    // ✅ Use customers.balance as source of truth
    // Negative balance = credit in customer's favour
    const customerBalance = Math.round(Number(customer.balance ?? 0) * 100) / 100

    const pdfBuffer = await generateOpenInvoicesPDF({
      customer,
      invoices:        openInvoices,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      customerBalance,  // ✅ pass through so PDF can show credit balance
      asAt:            new Date().toISOString().split('T')[0],
    })

    const safeName = (customer.business_name || customer.id)
      .replace(/[^a-z0-9]/gi, '-').toLowerCase()

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="open-invoices-${safeName}.pdf"`,
      },
    })

  } catch (error: any) {
    console.error('Open invoices error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}