// lib/pdf/quote.ts
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    return 'data:image/png;base64,' + base64
  } catch {
    return null
  }
}

function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2)
}

export interface QuotePDFData {
  quote: {
    quote_number: string
    created_at: string
    valid_until: string | null
    subtotal: number
    gst: number
    total: number
    notes: string | null
    terms: string | null
    items: {
      product_name: string
      quantity: number
      unit_price: number
      total: number
    }[]
    customer_business_name: string
    customer_email: string
    customer_address: string | null
    customer_phone: string | null
    customer_abn: string | null
  }
  bakery: {
    name: string
    email: string
    phone: string
    address: string
    abn: string
    logoUrl?: string
  }
}

export async function generateQuotePDF(data: QuotePDFData): Promise<jsPDF> {
  const { quote, bakery } = data

  const doc = new jsPDF({
    compress: true,
    putOnlyUsedFonts: true,
  })

  const textColor: [number, number, number] = [0, 0, 0]
  const margin = 20
  let yPos = margin

  // ── White header background ──────────────────────────────────────────
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, 210, 50, 'F')

  // ── Logo ─────────────────────────────────────────────────────────────
  const logoUrl = bakery.logoUrl
    ?? ((process.env.NEXT_PUBLIC_SITE_URL ?? '') + '/logo.png')
  const logoBase64 = logoUrl ? await imageUrlToBase64(logoUrl) : null

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, yPos + 2, 40, 20)
    } catch {
      // Fallback: draw circle with initial
      doc.setFillColor(206, 17, 38)
      doc.circle(margin + 12, yPos + 12, 12, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(bakery.name.charAt(0).toUpperCase(), margin + 12, yPos + 15, { align: 'center' })
    }
  }

  // ── Company name + details ───────────────────────────────────────────
  const textOffsetX = margin + 45
  doc.setTextColor(...textColor)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text(bakery.name, textOffsetX, yPos + 12)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  let detailsY = yPos + 20
  if (bakery.email) { doc.text(bakery.email, textOffsetX, detailsY); detailsY += 5 }
  if (bakery.phone) { doc.text(bakery.phone, textOffsetX, detailsY); detailsY += 5 }
  if (bakery.address) { doc.text(bakery.address, textOffsetX, detailsY); detailsY += 5 }
  if (bakery.abn) {
    doc.setFont('helvetica', 'bold')
    doc.text('ABN: ' + bakery.abn, textOffsetX, detailsY)
  }

  // ── QUOTE title ──────────────────────────────────────────────────────
  doc.setTextColor(...textColor)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('QUOTE', 210 - margin, 20, { align: 'right' })

  // ── Quote details box ────────────────────────────────────────────────
  yPos = 60
  doc.setFillColor(250, 250, 250)
  doc.rect(210 - 90, yPos, 70, 32, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Quote Number:', 210 - 85, yPos + 8)
  doc.text('Date:', 210 - 85, yPos + 16)
  doc.text('Valid Until:', 210 - 85, yPos + 24)

  doc.setFont('helvetica', 'normal')
  doc.text(String(quote.quote_number || ''), 210 - margin - 2, yPos + 8, { align: 'right' })
   doc.text(
    new Date(quote.created_at).toLocaleDateString('en-AU'),
    210 - margin - 2, yPos + 16, { align: 'right' }
  )
  doc.text(
    quote.valid_until
      ? new Date(quote.valid_until).toLocaleDateString('en-AU')
      : '—',
    210 - margin - 2, yPos + 24, { align: 'right' }
  )

  // ── Customer / Prepared For ──────────────────────────────────────────
  yPos = 60
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('PREPARED FOR:', margin, yPos)

  doc.setFontSize(9)
  yPos += 8

  if (quote.customer_business_name) {
    doc.setFont('helvetica', 'bold')
    doc.text(quote.customer_business_name, margin, yPos)
    yPos += 6
  }

  doc.setFont('helvetica', 'normal')
  if (quote.customer_email) { doc.text(quote.customer_email, margin, yPos); yPos += 5 }
  if (quote.customer_address) { doc.text(quote.customer_address, margin, yPos); yPos += 5 }
  if (quote.customer_phone) { doc.text(quote.customer_phone, margin, yPos); yPos += 5 }
  if (quote.customer_abn) {
    doc.setFont('helvetica', 'bold')
    doc.text('ABN: ' + quote.customer_abn, margin, yPos)
    yPos += 5
  }

  // ── Notes ────────────────────────────────────────────────────────────
  if (quote.notes) {
    yPos = Math.max(yPos + 5, 100)
    doc.setFontSize(7)
    doc.setTextColor(80, 80, 80)
    doc.text('Notes:', margin, yPos)
    yPos += 3
    const splitNotes = doc.splitTextToSize(quote.notes, 85)
    doc.text(splitNotes, margin, yPos)
    yPos += splitNotes.length * 3 + 3
    doc.setTextColor(...textColor)
  }

  // ── Items table ──────────────────────────────────────────────────────
  yPos = Math.max(yPos + 5, 110)

   const tableData = quote.items.map((item) => [
    String(item.product_name || ''),
    String(item.quantity ?? 0),
    formatCurrency(Number(item.unit_price) || 0),
    formatCurrency(Number(item.total) || 0),
  ])

  autoTable(doc, {
    startY: yPos,
    head: [['Product', 'Qty', 'Unit Price', 'Subtotal']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: margin, right: margin },
  })

  // ── Totals ───────────────────────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable.finalY + 10
  const summaryX = 210 - 75

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...textColor)
  doc.text('Subtotal (ex GST):', summaryX, finalY)
  doc.text(formatCurrency(quote.subtotal), 210 - margin, finalY, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.text('GST (10%):', summaryX, finalY + 7)
  doc.text(formatCurrency(quote.gst), 210 - margin, finalY + 7, { align: 'right' })

  doc.setFillColor(0, 0, 0)
  doc.rect(summaryX - 5, finalY + 12, 70, 10, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.text('TOTAL (inc GST):', summaryX, finalY + 19)
  doc.text(formatCurrency(quote.total), 210 - margin, finalY + 19, { align: 'right' })

  // ── Terms ────────────────────────────────────────────────────────────
  doc.setTextColor(...textColor)
  const termsY = finalY + 35

  if (quote.terms) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Terms & Conditions', margin, termsY)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const splitTerms = doc.splitTextToSize(quote.terms, 170)
    doc.text(splitTerms, margin, termsY + 6)
  }

  // ── Footer ───────────────────────────────────────────────────────────
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(
    'Generated: ' + new Date().toLocaleDateString('en-AU'),
    105, 280, { align: 'center' }
  )
  doc.text('Thank you for considering our services!', 105, 284, { align: 'center' })

  return doc
}