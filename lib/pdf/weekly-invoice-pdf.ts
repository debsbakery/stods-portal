// lib/pdf/weekly-invoice-pdf.ts
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency } from '@/lib/utils'

export interface WeeklyInvoiceData {
  weekly: {
    id:             string
    invoice_number: number | null
    week_start:     string
    week_end:       string
    total_amount:   number
    gst_amount:     number
    issued_at:      string
    revised_at:     string | null
    due_date:       string | null
    status:         string
  }
  customer: {
    business_name: string
    email:         string
    address?:      string | null
    abn?:          string | null
    phone?:        string | null
  }
  /** One row per delivery day (Sun–Sat) */
  dayLines: Array<{
    delivery_date:  string
    invoice_number: number | null
    order_id:       string
    total_amount:   number
  }>
  bakery: {
    name:       string
    email:      string
    phone:      string
    address:    string
    abn?:       string
    bankName?:  string
    bankBSB?:   string
    bankAccount?: string
  }
}

async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    return 'data:image/png;base64,' + Buffer.from(buffer).toString('base64')
  } catch { return null }
}

function drawFallbackLogo(doc: jsPDF, color: [number, number, number], margin: number, yPos: number) {
  doc.setFillColor(...color)
  doc.circle(margin + 12, yPos + 12, 12, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('B', margin + 12, yPos + 15, { align: 'center' })
}

export async function generateWeeklyInvoicePDF(data: WeeklyInvoiceData): Promise<jsPDF> {
  const { weekly, customer, dayLines, bakery } = data
  const doc = new jsPDF()

  const logoColor: [number, number, number] = [62, 31, 0]   // Norbake brown — matches default
  const textColor: [number, number, number] = [0, 0, 0]
  const margin = 20
  let yPos = margin

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, 210, 50, 'F')

  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const logoB64  = siteUrl ? await imageUrlToBase64(siteUrl + '/logo.png') : null

  if (logoB64) {
    try { doc.addImage(logoB64, 'PNG', margin, yPos + 2, 50, 25) }
    catch { drawFallbackLogo(doc, logoColor, margin, yPos) }
  } else {
    drawFallbackLogo(doc, logoColor, margin, yPos)
  }

  doc.setTextColor(...textColor)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text(bakery.name, margin + 60, yPos + 12)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(bakery.email,   margin + 60, yPos + 20)
  doc.text(bakery.phone,   margin + 60, yPos + 25)
  doc.text(bakery.address, margin + 60, yPos + 30)
  if (bakery.abn) {
    doc.setFont('helvetica', 'bold')
    doc.text('ABN: ' + bakery.abn, margin + 60, yPos + 36)
  }

  // ── Title ───────────────────────────────────────────────────────────────
  doc.setTextColor(...textColor)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('WEEKLY TAX INVOICE', 210 - margin, 20, { align: 'right' })

  if (weekly.status === 'revised' && weekly.revised_at) {
    doc.setFontSize(9)
    doc.setTextColor(200, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.text('— REVISED —', 210 - margin, 28, { align: 'right' })
    doc.setTextColor(...textColor)
  }

  const invoiceNum = weekly.invoice_number
    ? String(weekly.invoice_number).padStart(6, '0')
    : 'TEMP-' + weekly.id.slice(0, 8).toUpperCase()

  // ── Invoice details box ─────────────────────────────────────────────────
  yPos = 60
  doc.setFillColor(250, 250, 250)
  doc.rect(210 - 90, yPos, 70, 48, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Invoice Number:', 210 - 85, yPos + 8)
  doc.text('Issue Date:',     210 - 85, yPos + 16)
  doc.text('Period:',         210 - 85, yPos + 24)
  doc.text('Due Date:',       210 - 85, yPos + 36)

  doc.setFont('helvetica', 'normal')
  const issueDate  = new Date(weekly.issued_at).toLocaleDateString('en-AU')
  const periodFrom = new Date(weekly.week_start + 'T00:00:00').toLocaleDateString('en-AU')
  const periodTo   = new Date(weekly.week_end   + 'T00:00:00').toLocaleDateString('en-AU')
  const dueDate    = weekly.due_date
    ? new Date(weekly.due_date + 'T00:00:00').toLocaleDateString('en-AU')
    : '-'

  doc.text(invoiceNum,                   210 - margin - 2, yPos + 8,  { align: 'right' })
  doc.text(issueDate,                    210 - margin - 2, yPos + 16, { align: 'right' })
  doc.setFontSize(7)
  doc.text(`${periodFrom}`,              210 - margin - 2, yPos + 24, { align: 'right' })
  doc.text(`to ${periodTo}`,             210 - margin - 2, yPos + 30, { align: 'right' })
  doc.setFontSize(8)
  doc.text(dueDate,                      210 - margin - 2, yPos + 36, { align: 'right' })

  // ── Bill To ─────────────────────────────────────────────────────────────
  yPos = 60
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO:', margin, yPos)

  doc.setFontSize(9)
  yPos += 8

  if (customer.business_name) {
    doc.setFont('helvetica', 'bold')
    doc.text(customer.business_name, margin, yPos)
    yPos += 6
  }
  doc.setFont('helvetica', 'normal')

  if (customer.email)   { doc.text(customer.email, margin, yPos); yPos += 5 }
  if (customer.address) { doc.text(customer.address, margin, yPos); yPos += 5 }
  if (customer.phone)   { doc.text(customer.phone, margin, yPos); yPos += 5 }
  if (customer.abn) {
    doc.setFont('helvetica', 'bold')
    doc.text('ABN: ' + customer.abn, margin, yPos)
    yPos += 5
  }

  // ── Line items: one row per delivery day ────────────────────────────────
  yPos = Math.max(yPos + 10, 120)

  const tableData = dayLines.map(line => {
    const dateObj    = new Date(line.delivery_date + 'T00:00:00')
    const dayName    = dateObj.toLocaleDateString('en-AU', { weekday: 'short' })
    const dateLabel  = dateObj.toLocaleDateString('en-AU')
    const docketRef  = line.invoice_number
      ? `Daily #${String(line.invoice_number).padStart(6, '0')}`
      : `Order ${line.order_id.slice(0, 8).toUpperCase()}`
    return [
      `${dayName} ${dateLabel}`,
      docketRef,
      formatCurrency(line.total_amount),
    ]
  })

  autoTable(doc, {
    startY: yPos,
    head:   [['Delivery Day', 'Reference', 'Amount (inc GST)']],
    body:   tableData,
    theme:  'striped',
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize:  9,
    },
    bodyStyles: {
      fontSize:  8,
      textColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 60 },
      2: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: margin, right: margin },
  })

  // ── Totals ──────────────────────────────────────────────────────────────
  const subtotal = weekly.total_amount - weekly.gst_amount
  const finalY   = (doc as any).lastAutoTable.finalY + 10
  const summaryX = 210 - 75

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...textColor)
  doc.text('Subtotal (ex GST):', summaryX, finalY)
  doc.text(formatCurrency(subtotal), 210 - margin, finalY, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.text('GST (10%):', summaryX, finalY + 7)
  doc.text(formatCurrency(weekly.gst_amount), 210 - margin, finalY + 7, { align: 'right' })

  doc.setFillColor(0, 0, 0)
  doc.rect(summaryX - 5, finalY + 12, 70, 10, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.text('TOTAL (inc GST):', summaryX, finalY + 19)
  doc.text(formatCurrency(weekly.total_amount), 210 - margin, finalY + 19, { align: 'right' })

  // ── Bank Payment Details ────────────────────────────────────────────────
  doc.setTextColor(...textColor)
  const bankY = finalY + 35

  if (bakery.bankName || bakery.bankBSB || bakery.bankAccount) {
    doc.setFillColor(240, 253, 244)
    doc.rect(margin, bankY, 170, 32, 'F')

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(22, 101, 52)
    doc.text('Payment Information', margin + 5, bankY + 8)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)

    let bankLineY = bankY + 15
    if (bakery.bankName)    { doc.text('Bank: '    + bakery.bankName,    margin + 5, bankLineY); bankLineY += 5 }
    if (bakery.bankBSB)     { doc.text('BSB: '     + bakery.bankBSB,     margin + 5, bankLineY); bankLineY += 5 }
    if (bakery.bankAccount) { doc.text('Account: ' + bakery.bankAccount, margin + 5, bankLineY); bankLineY += 5 }
    doc.text('Reference: ' + invoiceNum, margin + 5, bankLineY)
  }

  return doc
}