export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

async function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

// GET - Export recall report (CSV or PDF)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createAdminClient()
    const { id } = params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'csv' // csv or pdf

    // Get recall details
    const { data: recall, error: recallError } = await supabase
      .from('product_recalls')
      .select('*')
      .eq('id', id)
      .single()

    if (recallError) throw recallError

    // Get affected customers
    const { data: affectedCustomers, error: customersError } = await supabase
      .from('recall_affected_customers')
      .select(`
        *,
        customers (
          id,
          business_name,
          contact_name,
          email,
          phone,
          address
        )
      `)
          .eq('recall_id', id)
      .order('total_affected_value', { ascending: false })
    if (customersError) throw customersError

    const customers = affectedCustomers || []

    if (format === 'csv') {
      return generateCSV(recall, customers)
    } else if (format === 'pdf') {
      return await generatePDF(recall, customers)
    } else {
      return NextResponse.json({ error: 'Invalid format. Use csv or pdf.' }, { status: 400 })
    }

  } catch (error: any) {
    console.error('Error exporting recall:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generateCSV(recall: any, customers: any[]) {
  const rows = [
    ['Product Recall Report'],
    [''],
    ['Recall ID', recall.id],
    ['Product', recall.product_name],
    ['Reason', recall.reason],
    ['Severity', recall.severity],
    ['Date Range', `${recall.date_from} to ${recall.date_to}`],
    ['Initiated By', recall.initiated_by || 'N/A'],
    ['Initiated At', new Date(recall.initiated_at).toLocaleString('en-AU')],
    ['Status', recall.status],
    [''],
    ['Affected Customers'],
    ['Business Name', 'Contact', 'Email', 'Phone', 'Affected Value', 'Notified', 'Acknowledged', 'Credit Issued', 'Product Returned'],
  ]

  for (const customer of customers) {
    const c = customer.customers
    rows.push([
      c?.business_name || 'N/A',
      c?.contact_name || 'N/A',
      c?.email || 'N/A',
      c?.phone || 'N/A',
      `$${customer.total_affected_value.toFixed(2)}`,
      customer.notification_sent_at ? new Date(customer.notification_sent_at).toLocaleDateString('en-AU') : 'Not sent',
      customer.customer_acknowledged_at ? new Date(customer.customer_acknowledged_at).toLocaleDateString('en-AU') : 'No',
      customer.credit_issued ? 'Yes' : 'No',
      customer.product_returned ? 'Yes' : 'No',
    ])
  }

  const csvContent = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="recall-${recall.id.slice(0, 8)}-${Date.now()}.csv"`,
    },
  })
}

async function generatePDF(recall: any, customers: any[]) {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4
  const { width, height } = page.getSize()
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  let y = height - 50

    const bakeryName = process.env.BAKERY_NAME ?? ''
  const bakeryAddress = process.env.BAKERY_ADDRESS ?? ''
  const bakeryABN = process.env.BAKERY_ABN ?? ''

  // Header
  page.drawText(bakeryName, { x: 50, y, size: 16, font: fontBold, color: rgb(0, 0, 0) })
  y -= 20
  page.drawText(bakeryAddress, { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) })
  y -= 15
  page.drawText(`ABN: ${bakeryABN}`, { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) })
  y -= 30

  // Title
  page.drawText('PRODUCT RECALL COMPLIANCE REPORT', { x: 50, y, size: 18, font: fontBold, color: rgb(0.8, 0, 0) })
  y -= 30

  // Recall Details
  const details = [
    ['Recall ID:', recall.id],
    ['Product:', recall.product_name],
    ['Reason:', recall.reason],
    ['Severity:', recall.severity.toUpperCase()],
    ['Date Range:', `${new Date(recall.date_from).toLocaleDateString('en-AU')} to ${new Date(recall.date_to).toLocaleDateString('en-AU')}`],
    ['Initiated By:', recall.initiated_by || 'N/A'],
    ['Initiated At:', new Date(recall.initiated_at).toLocaleString('en-AU')],
    ['Status:', recall.status.toUpperCase()],
  ]

  for (const [label, value] of details) {
    page.drawText(label, { x: 50, y, size: 10, font: fontBold })
    const textValue = String(value).substring(0, 70)
    page.drawText(textValue, { x: 150, y, size: 10, font })
    y -= 18
  }

  y -= 10

  // Summary
  const totalCustomers = customers.length
  const notifiedCount = customers.filter(c => c.notification_sent_at).length
  const acknowledgedCount = customers.filter(c => c.customer_acknowledged_at).length
  const creditIssuedCount = customers.filter(c => c.credit_issued).length
  const totalValue = customers.reduce((sum, c) => sum + c.total_affected_value, 0)

  page.drawText('Summary:', { x: 50, y, size: 12, font: fontBold })
  y -= 20

  const summary = [
    ['Total Affected Customers:', String(totalCustomers)],
    ['Customers Notified:', String(notifiedCount)],
    ['Customers Acknowledged:', String(acknowledgedCount)],
    ['Credits Issued:', String(creditIssuedCount)],
    ['Total Affected Value:', `$${totalValue.toFixed(2)}`],
  ]

  for (const [label, value] of summary) {
    page.drawText(label, { x: 50, y, size: 10, font: fontBold })
    page.drawText(value, { x: 250, y, size: 10, font })
    y -= 18
  }

  y -= 10

  // Affected Customers Table Header
  page.drawText('Affected Customers:', { x: 50, y, size: 12, font: fontBold })
  y -= 20

  page.drawText('Business Name', { x: 50, y, size: 9, font: fontBold })
  page.drawText('Email', { x: 200, y, size: 9, font: fontBold })
  page.drawText('Value', { x: 350, y, size: 9, font: fontBold })
  page.drawText('Notified', { x: 410, y, size: 9, font: fontBold })
  page.drawText('Credit', { x: 480, y, size: 9, font: fontBold })
  y -= 15

  // Draw line
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) })
  y -= 10

  // Customer rows
  for (const customer of customers) {
    if (y < 100) {
      // New page if needed
      const newPage = pdfDoc.addPage([595, 842])
      y = height - 50
      page.drawText('(continued)', { x: 50, y: y + 20, size: 10, font, color: rgb(0.5, 0.5, 0.5) })
    }

    const c = customer.customers
    const businessName = (c?.business_name || 'N/A').substring(0, 20)
    const email = (c?.email || 'N/A').substring(0, 20)
    const value = `$${customer.total_affected_value.toFixed(2)}`
    const notified = customer.notification_sent_at ? 'Yes' : 'No'
    const credit = customer.credit_issued ? 'Yes' : 'No'

    page.drawText(businessName, { x: 50, y, size: 8, font })
    page.drawText(email, { x: 200, y, size: 8, font })
    page.drawText(value, { x: 350, y, size: 8, font })
    page.drawText(notified, { x: 410, y, size: 8, font })
    page.drawText(credit, { x: 480, y, size: 8, font })

    y -= 15
  }

  // Footer
  y = 50
  page.drawText(`Report generated: ${new Date().toLocaleString('en-AU')}`, { 
    x: 50, 
    y, 
    size: 8, 
    font, 
    color: rgb(0.5, 0.5, 0.5) 
  })

  const pdfBytes = await pdfDoc.save()
  const buffer = Buffer.from(pdfBytes)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="recall-report-${recall.id.slice(0, 8)}.pdf"`,
    },
  })
}
