export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customer_id')
    const format = searchParams.get('format')

    if (!customerId) {
      return NextResponse.json({ error: 'customer_id required' }, { status: 400 })
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single()

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const { data: transactions } = await supabase
      .from('ar_transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })

    let runningBalance = 0
    const ledger = (transactions || []).map((tx) => {
      const amount = parseFloat(tx.amount)
      const isDebit = ['invoice', 'charge', 'late_fee'].includes(tx.type)
      if (isDebit) runningBalance += amount
      else runningBalance -= amount
      return {
        date: tx.created_at,
        description: tx.description,
        type: tx.type,
        invoice_id: tx.invoice_id,
        debit: isDebit ? amount : 0,
        credit: !isDebit ? amount : 0,
        balance: runningBalance,
      }
    })

    if (format === 'pdf') {
      const pdfDoc = await PDFDocument.create()
      const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

      let page = pdfDoc.addPage([595, 842])
      const { width, height } = page.getSize()
      let y = height - 50

      const drawText = (
        text: string,
        x: number,
        yPos: number,
        opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}
      ) => {
        page.drawText(String(text), {
          x,
          y: yPos,
          size: opts.size ?? 9,
          font: opts.bold ? fontBold : font,
          color: opts.color ? rgb(...opts.color) : rgb(0.2, 0.2, 0.2),
        })
      }

      const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
        page.drawLine({
          start: { x: x1, y: y1 },
          end:   { x: x2, y: y2 },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7),
        })
      }

      // Header
      drawText("stods bakeryBakery", 50, y, { size: 20, bold: true, color: [0, 0.416, 0.306] })
      y -= 22
      drawText('Customer Ledger', 50, y, { size: 12 })
      y -= 20
      drawText(`Customer: ${customer.business_name || customer.email}`, 50, y, { size: 10, bold: true })
      y -= 15
      drawText(`Current Balance: $${runningBalance.toFixed(2)}`, 50, y, { size: 10 })
      y -= 20
      drawLine(50, y, width - 50, y)
      y -= 18

      // Table header
      drawText('Date',        50,  y, { size: 9, bold: true })
      drawText('Description', 130, y, { size: 9, bold: true })
      drawText('Type',        330, y, { size: 9, bold: true })
      drawText('Debit',       400, y, { size: 9, bold: true })
      drawText('Credit',      455, y, { size: 9, bold: true })
      drawText('Balance',     510, y, { size: 9, bold: true })
      y -= 12
      drawLine(50, y, width - 50, y)
      y -= 14

      // Rows
      for (const tx of ledger) {
        if (y < 60) {
          page = pdfDoc.addPage([595, 842])
          y = height - 50
        }

        const dateStr = new Date(tx.date).toLocaleDateString('en-AU', {
          day: '2-digit', month: '2-digit', year: 'numeric'
        })
        const desc = tx.description?.length > 28
          ? tx.description.slice(0, 26) + '..'
          : (tx.description || '-')

        drawText(dateStr,50,  y, { size: 8 })
        drawText(desc,             130, y, { size: 8 })
        drawText(tx.type,          330, y, { size: 8 })
        drawText(tx.debit  > 0 ? `$${tx.debit.toFixed(2)}`  : '', 400, y, { size: 8 })
        drawText(tx.credit > 0 ? `$${tx.credit.toFixed(2)}` : '', 455, y, { size: 8 })
        drawText(`$${tx.balance.toFixed(2)}`, 510, y, { size: 8 })
        y -= 14
      }

      // Summary
      y -= 10
      drawLine(50, y, width - 50, y)
      y -= 16
      const totalCharges  = ledger.reduce((s, t) => s + t.debit, 0)
      const totalPayments = ledger.reduce((s, t) => s + t.credit, 0)
      drawText(`Total Charges: $${totalCharges.toFixed(2)}`,   50,  y, { size: 9, bold: true })
      drawText(`Total Payments: $${totalPayments.toFixed(2)}`, 200, y, { size: 9, bold: true })
      drawText(`Closing Balance: $${runningBalance.toFixed(2)}`, 380, y, {
        size: 9, bold: true,
        color: runningBalance > 0 ? [0.808, 0.067, 0.149] : [0, 0.416, 0.306],
      })

      const pdfBytes = await pdfDoc.save()
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="ledger-${customer.business_name || customer.id}.pdf"`,
        },
      })
    }

    // JSON response
    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        business_name: customer.business_name,
        email: customer.email,
        current_balance: runningBalance,
      },
      ledger,
      summary: {
        total_charges:  ledger.reduce((s, t) => s + t.debit, 0),
        total_payments: ledger.reduce((s, t) => s + t.credit, 0),
        current_balance: runningBalance,
      },
    })} catch (error: any) {
    console.error('Customer ledger error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate ledger' },
      { status: 500 }
    )
  }
}