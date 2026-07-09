// lib/pdf/open-invoices.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// ✅ Branding — env vars override; edit fallbacks per portal after xcopy
const BRAND_NAME  = process.env.BAKERY_NAME  ?? "Stods bakery"
const BRAND_EMAIL = process.env.BAKERY_EMAIL ?? 'orders@stodsbakery.com'

interface OpenInvoice {
  date: string
  due_date: string | null
  reference: string
  invoice_number?: number | null
  description: string
  amount: number
  amount_paid: number
  outstanding: number
  status: 'unpaid' | 'partial' | 'paid'
}
interface CreditLine {
  date: string
  description: string
  amount: number
  remaining: number
}
interface PaymentLine {
  date: string
  reference: string | null
  method: string
  amount: number
}

interface AgeingBucket {
  label: string
  amount: number
}

interface OpenInvoicesData {
  customer: {
    business_name?: string
    contact_name?: string
    email?: string
    address?: string
    payment_terms?: string
  }
  invoices: OpenInvoice[]
  totalOutstanding: number
  customerBalance?: number   // negative = credit in customer's favour
  asAt: string
  payments?: PaymentLine[]   // payments received since periodStart
  periodStart?: string       // 1st of month of oldest unpaid invoice
  ageing?: AgeingBucket[]    // Current / 14 / 30 / 60 / 90+
  credits?: CreditLine[]        // unapplied credits
  unappliedCredits?: number
  netAmountDue?: number
}

export async function generateOpenInvoicesPDF(data: OpenInvoicesData): Promise<Buffer> {
   const {
    customer, invoices, totalOutstanding, customerBalance, asAt,
    payments = [], periodStart, ageing = [],
    credits = [], unappliedCredits = 0, netAmountDue,
    brandName = BRAND_NAME, brandEmail = BRAND_EMAIL, headerColor,
  } = data
  const pdfDoc   = await PDFDocument.create()
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)

  let page = pdfDoc.addPage([595, 842])
  const { width, height } = page.getSize()

  const GREEN: [number, number, number] = [0, 0.416, 0.306]
  const RED:   [number, number, number] = [0.808, 0.067, 0.149]
  const AMBER: [number, number, number] = [0.8, 0.5, 0.0]
  const GREY:  [number, number, number] = [0.4, 0.4, 0.4]
  const DARK:  [number, number, number] = [0.15, 0.15, 0.15]
  const RIGHT_MARGIN = width - 50

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const fmtDate = (d: string | null) => {
    if (!d) return '—'
    const dt = new Date(d)
    return [
      dt.getDate().toString().padStart(2, '0'),
      (dt.getMonth() + 1).toString().padStart(2, '0'),
      dt.getFullYear(),
    ].join('/')
  }

  const isOverdue = (due: string | null) => {
    if (!due) return false
    return new Date(due) < new Date()
  }

  let y = height - 95

  // Pagination: start a new page when running out of vertical space
  const ensureSpace = (needed: number) => {
    if (y - needed < 70) {
      page = pdfDoc.addPage([595, 842])
      y = height - 50
      page.drawText(`${BRAND_NAME} — Open Invoice Statement (continued)`, {
        x: 50, y, size: 8, font, color: rgb(...GREY),
      })
      y -= 25
    }
  }

  // Header bar
  page.drawRectangle({ x: 0, y: height - 75, width, height: 75, color: rgb(...GREEN) })
  page.drawText(BRAND_NAME, {
    x: 50, y: height - 35, size: 22, font: fontBold, color: rgb(1, 1, 1),
  })
  page.drawText('OPEN INVOICE STATEMENT', {
    x: 50, y: height - 55, size: 9, font, color: rgb(0.8, 1, 0.9),
  })
  page.drawText(`As at: ${fmtDate(asAt)}`, {
    x: RIGHT_MARGIN - 150, y: height - 45, size: 10, font: fontBold, color: rgb(1, 1, 1),
  })

  // Customer info box
  page.drawRectangle({ x: 50, y: y - 55, width: 260, height: 65, color: rgb(0.97, 0.97, 0.97) })
  y -= 10
  page.drawText('TO:', { x: 50, y, size: 7, font, color: rgb(...GREY) })
  y -= 14
  page.drawText(
    customer.business_name || customer.contact_name || 'Customer',
    { x: 50, y, size: 11, font: fontBold, color: rgb(...DARK) }
  )
  if (customer.address) {
    y -= 13
    page.drawText(customer.address, { x: 50, y, size: 8, font, color: rgb(...GREY) })
  }
  if (customer.email) {
    y -= 12
    page.drawText(customer.email, { x: 50, y, size: 8, font, color: rgb(...GREY) })
  }

  // Total outstanding box — or account status box if no open invoices
  const boxX = RIGHT_MARGIN - 150
  const hasCreditBalance = (customerBalance ?? 0) < -0.01
  const hasOpenInvoices  = invoices.length > 0

  if (hasOpenInvoices) {
    page.drawRectangle({ x: boxX, y: height - 160, width: 150, height: 65, color: rgb(0.99, 0.94, 0.94) })
    page.drawText('TOTAL OUTSTANDING', { x: boxX + 8, y: height - 110, size: 7, font, color: rgb(...GREY) })
    page.drawText(fmt(totalOutstanding), { x: boxX + 8, y: height - 128, size: 16, font: fontBold, color: rgb(...RED) })
    page.drawText(`${invoices.length} open invoice${invoices.length !== 1 ? 's' : ''}`, {
      x: boxX + 8, y: height - 146, size: 8, font, color: rgb(...GREY),
    })
  } else {
    page.drawRectangle({ x: boxX, y: height - 160, width: 150, height: 65, color: rgb(0.94, 0.99, 0.94) })
    page.drawText('ACCOUNT STATUS', { x: boxX + 8, y: height - 110, size: 7, font, color: rgb(...GREY) })
    page.drawText('$0.00', { x: boxX + 8, y: height - 128, size: 16, font: fontBold, color: rgb(...GREEN) })
    page.drawText('0 open invoices', { x: boxX + 8, y: height - 146, size: 8, font, color: rgb(...GREY) })
  }

  y -= 25

  page.drawLine({ start: { x: 50, y }, end: { x: RIGHT_MARGIN, y }, thickness: 1, color: rgb(0.75, 0.75, 0.75) })
  y -= 20

  if (hasOpenInvoices) {
    const drawInvoiceTableHeader = () => {
      page.drawRectangle({ x: 50, y: y - 4, width: RIGHT_MARGIN - 50, height: 18, color: rgb(0.1, 0.1, 0.1) })
      const headers = [
        { label: 'INV DATE',    x: 52  },
        { label: 'DUE DATE',    x: 130 },
        { label: 'REFERENCE',   x: 208 },
        { label: 'INVOICE AMT', x: 320 },
        { label: 'PAID',        x: 400 },
        { label: 'OUTSTANDING', x: 465 },
      ]
      for (const h of headers) {
        page.drawText(h.label, { x: h.x, y: y + 2, size: 7, font: fontBold, color: rgb(1, 1, 1) })
      }
      y -= 20
    }

    drawInvoiceTableHeader()

    let rowIdx = 0
    for (const inv of invoices) {
      if (y - 24 < 70) {
        ensureSpace(24)
        drawInvoiceTableHeader()
      }

      if (rowIdx % 2 === 0) {
        page.drawRectangle({ x: 50, y: y - 4, width: RIGHT_MARGIN - 50, height: 18, color: rgb(0.97, 0.97, 0.97) })
      }

      const overdue   = isOverdue(inv.due_date)
      const dateColor = overdue ? RED : DARK

      page.drawText(fmtDate(inv.date),     { x: 52,  y, size: 8, font, color: rgb(...DARK) })
      page.drawText(fmtDate(inv.due_date), { x: 130, y, size: 8, font, color: rgb(...dateColor) })
      page.drawText(inv.reference,         { x: 208, y, size: 8, font, color: rgb(...DARK) })
      page.drawText(fmt(inv.amount),       { x: 320, y, size: 8, font, color: rgb(...DARK) })
      page.drawText(
        inv.amount_paid > 0 ? fmt(inv.amount_paid) : '—',
        { x: 400, y, size: 8, font, color: rgb(...GREEN) }
      )
      page.drawText(fmt(inv.outstanding), { x: 465, y, size: 8, font: fontBold, color: rgb(...RED) })

      if (overdue) {
        page.drawText('OVERDUE', { x: RIGHT_MARGIN - 45, y, size: 6, font: fontBold, color: rgb(...RED) })
      }
      if (inv.status === 'partial') {
        page.drawText('PART PAID', { x: RIGHT_MARGIN - 48, y: y - 8, size: 6, font, color: rgb(...AMBER) })
      }

      y -= 20
      rowIdx++
    }

    ensureSpace(45)
    y -= 5
    page.drawLine({ start: { x: 50, y }, end: { x: RIGHT_MARGIN, y }, thickness: 1, color: rgb(0.4, 0.4, 0.4) })
    y -= 18

    page.drawRectangle({ x: 380, y: y - 6, width: RIGHT_MARGIN - 380, height: 24, color: rgb(0.99, 0.94, 0.94) })
    page.drawText('TOTAL OUTSTANDING:', { x: 290, y: y + 3, size: 10, font: fontBold, color: rgb(...DARK) })
    page.drawText(fmt(totalOutstanding), { x: 465, y: y + 3, size: 11, font: fontBold, color: rgb(...RED) })
    y -= 10

  } else {
    page.drawText('All invoices are up to date.', {
      x: 50, y, size: 11, font: fontBold, color: rgb(...GREEN),
    })
    y -= 20
  }

  // PAYMENTS RECEIVED since period start
  if (payments.length > 0) {
    ensureSpace(70)
    y -= 25
    page.drawText(
      `PAYMENTS RECEIVED${periodStart ? ` SINCE ${fmtDate(periodStart)}` : ''}`,
      { x: 50, y, size: 8, font: fontBold, color: rgb(...DARK) }
    )
    y -= 16

    page.drawRectangle({ x: 50, y: y - 4, width: RIGHT_MARGIN - 50, height: 16, color: rgb(0.92, 0.96, 0.93) })
    page.drawText('DATE',      { x: 52,  y, size: 7, font: fontBold, color: rgb(...GREEN) })
    page.drawText('METHOD',    { x: 130, y, size: 7, font: fontBold, color: rgb(...GREEN) })
    page.drawText('REFERENCE', { x: 230, y, size: 7, font: fontBold, color: rgb(...GREEN) })
    page.drawText('AMOUNT',    { x: 465, y, size: 7, font: fontBold, color: rgb(...GREEN) })
    y -= 16

    let paymentsTotal = 0
    for (const p of payments) {
      ensureSpace(18)
      page.drawText(fmtDate(p.date),             { x: 52,  y, size: 8, font, color: rgb(...DARK) })
      page.drawText(p.method.replace(/_/g, ' '), { x: 130, y, size: 8, font, color: rgb(...DARK) })
      page.drawText(p.reference || '—',          { x: 230, y, size: 8, font, color: rgb(...GREY) })
      page.drawText(fmt(p.amount),               { x: 465, y, size: 8, font: fontBold, color: rgb(...GREEN) })
      paymentsTotal += p.amount
      y -= 16
    }

    ensureSpace(20)
    page.drawLine({ start: { x: 380, y: y + 10 }, end: { x: RIGHT_MARGIN, y: y + 10 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) })
    page.drawText('TOTAL PAYMENTS:', { x: 340, y, size: 8, font: fontBold, color: rgb(...DARK) })
    page.drawText(fmt(paymentsTotal), { x: 465, y, size: 9, font: fontBold, color: rgb(...GREEN) })
    y -= 10
      // ✅ UNAPPLIED CREDITS + NET AMOUNT DUE
  if (credits.length > 0) {
    ensureSpace(70 + credits.length * 16)
    y -= 25
    page.drawText('UNAPPLIED CREDITS', { x: 50, y, size: 8, font: fontBold, color: rgb(...DARK) })
    y -= 16

    page.drawRectangle({ x: 50, y: y - 4, width: RIGHT_MARGIN - 50, height: 16, color: rgb(0.92, 0.96, 0.93) })
    page.drawText('DATE',        { x: 52,  y, size: 7, font: fontBold, color: rgb(...GREEN) })
    page.drawText('DESCRIPTION', { x: 130, y, size: 7, font: fontBold, color: rgb(...GREEN) })
    page.drawText('CREDIT AMT',  { x: 380, y, size: 7, font: fontBold, color: rgb(...GREEN) })
    page.drawText('REMAINING',   { x: 465, y, size: 7, font: fontBold, color: rgb(...GREEN) })
    y -= 16

    for (const c of credits) {
      ensureSpace(18)
      page.drawText(fmtDate(c.date),                    { x: 52,  y, size: 8, font, color: rgb(...DARK) })
      page.drawText(c.description.slice(0, 55),         { x: 130, y, size: 8, font, color: rgb(...DARK) })
      page.drawText(fmt(c.amount),                      { x: 380, y, size: 8, font, color: rgb(...GREY) })
      page.drawText(`-${fmt(c.remaining)}`,             { x: 465, y, size: 8, font: fontBold, color: rgb(...GREEN) })
      y -= 16
    }

    ensureSpace(30)
    y -= 4
    page.drawLine({ start: { x: 380, y: y + 12 }, end: { x: RIGHT_MARGIN, y: y + 12 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) })
    page.drawText('TOTAL CREDITS:', { x: 350, y, size: 8, font: fontBold, color: rgb(...DARK) })
    page.drawText(`-${fmt(unappliedCredits)}`, { x: 465, y, size: 9, font: fontBold, color: rgb(...GREEN) })
    y -= 20

    // Net amount due
    page.drawRectangle({ x: 320, y: y - 6, width: RIGHT_MARGIN - 320, height: 24, color: rgb(0.99, 0.94, 0.94) })
    page.drawText('NET AMOUNT DUE:', { x: 328, y: y + 3, size: 10, font: fontBold, color: rgb(...DARK) })
    page.drawText(fmt(netAmountDue ?? (totalOutstanding - unappliedCredits)), {
      x: 465, y: y + 3, size: 11, font: fontBold, color: rgb(...RED),
    })
    y -= 10
  }
  }

  // AGEING SUMMARY
  if (ageing.length > 0 && hasOpenInvoices) {
    ensureSpace(85)
    y -= 28
    page.drawText('AGEING SUMMARY', { x: 50, y, size: 8, font: fontBold, color: rgb(...DARK) })
    y -= 16

    const cells = [
      ...ageing,
      { label: 'TOTAL DUE', amount: ageing.reduce((s, b) => s + b.amount, 0) },
    ]
    const colWidth = (RIGHT_MARGIN - 50) / cells.length

    page.drawRectangle({ x: 50, y: y - 4, width: RIGHT_MARGIN - 50, height: 18, color: rgb(0.1, 0.1, 0.1) })
    cells.forEach((c, i) => {
      page.drawText(c.label.toUpperCase(), {
        x: 54 + i * colWidth, y: y + 2, size: 7, font: fontBold, color: rgb(1, 1, 1),
      })
    })
    y -= 22

    page.drawRectangle({ x: 50, y: y - 6, width: RIGHT_MARGIN - 50, height: 22, color: rgb(0.97, 0.97, 0.97) })
    cells.forEach((c, i) => {
      const isAlert = (c.label === '90+ Days' || c.label === 'TOTAL DUE') && c.amount > 0.01
      page.drawText(fmt(c.amount), {
        x: 54 + i * colWidth, y, size: 9,
        font: isAlert ? fontBold : font,
        color: rgb(...(isAlert ? RED : DARK)),
      })
    })
    y -= 15
  }

  // Credit balance section
  if (hasCreditBalance) {
    ensureSpace(60)
    y -= 20
    const creditAmt = Math.abs(customerBalance ?? 0)
    page.drawRectangle({ x: 50, y: y - 8, width: RIGHT_MARGIN - 50, height: 36, color: rgb(0.94, 0.99, 0.94) })
    page.drawText('CREDIT BALANCE ON ACCOUNT', {
      x: 58, y: y + 14, size: 8, font: fontBold, color: rgb(...GREEN),
    })
    page.drawText(
      `This account has a credit balance of ${fmt(creditAmt)} available.`,
      { x: 58, y: y + 2, size: 8, font, color: rgb(...GREY) }
    )
    page.drawText(fmt(creditAmt), {
      x: RIGHT_MARGIN - 80, y: y + 8, size: 13, font: fontBold, color: rgb(...GREEN),
    })
    y -= 20
  }

  // Footer
  ensureSpace(50)
  y -= 25
  page.drawLine({ start: { x: 50, y }, end: { x: RIGHT_MARGIN, y }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) })
  y -= 15
  page.drawText(
    `Payment Terms: ${customer.payment_terms || '30 days'}`,
    { x: 50, y, size: 8, font, color: rgb(...GREY) }
  )
  page.drawText(
    `${BRAND_NAME}  |  ${BRAND_EMAIL}`,
    { x: RIGHT_MARGIN - 250, y, size: 8, font, color: rgb(...GREY) }
  )

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}