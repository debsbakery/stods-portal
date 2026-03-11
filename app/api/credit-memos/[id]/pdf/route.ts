export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: memo, error } = await supabase
    .from('credit_memos')
    .select(`
      *,
      customer:customers(id, business_name, contact_name, email, address, abn),
      items:credit_memo_items(*)
    `)
    .eq('id', id)
    .single()

  if (error || !memo) {
    return NextResponse.json({ error: 'Credit memo not found' }, { status: 404 })
  }

  const pdfDoc  = await PDFDocument.create()
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage([595, 842])
  const { width, height } = page.getSize()
  let y = height - 50

  const drawText = (
    text: string, x: number, yPos: number,
    opts: { size?: number; bold?: boolean; color?: [number,number,number] } = {}
  ) => {
    page.drawText(String(text), {
      x, y: yPos,
      size: opts.size ?? 10,
      font: opts.bold ? fontBold : font,
      color: opts.color ? rgb(...opts.color) : rgb(0.2, 0.2, 0.2),
    })
  }

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    page.drawLine({
      start: { x: x1, y: y1 }, end: { x: x2, y: y2 },
      thickness: 0.5, color: rgb(0.7, 0.7, 0.7),
    })
  }

  const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`
  const fmtDate = (d: string) => {
    const dt = new Date(d)
    return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`
  }

  // ── Header ───────────────────────────────────────────────
  drawText("Stods Bakery", 50, y, { size: 24, bold: true, color: [0, 0.416, 0.306] })
  y -= 22
  drawText('TAX CREDIT NOTE', 50, y, { size: 12, bold: true, color: [0.808, 0.067, 0.149] })

  drawText(`Credit Memo #: ${memo.memo_number}`, 350, height - 50, { size: 10 })
  drawText(`Date: ${fmtDate(memo.created_at)}`,  350, height - 65, { size: 10 })
  drawText(`Type: ${memo.credit_type === 'stale_return' ? 'Stale Return' : 'Product Credit'}`, 350, height - 80, { size: 10 })

  // ── Customer ─────────────────────────────────────────────
  y -= 30
  drawText('Credit To:', 50, y, { size: 11, bold: true })
  y -= 16
  drawText(memo.customer.business_name || memo.customer.contact_name || memo.customer.email, 50, y, { size: 10 })
  if (memo.customer.address) { y -= 14; drawText(memo.customer.address, 50, y, { size: 9 }) }
  if (memo.customer.abn)     { y -= 14; drawText(`ABN: ${memo.customer.abn}`, 50, y, { size: 9 }) }

  y -= 20
  drawLine(50, y, width - 50, y)
  y -= 18

  // ── Table header ─────────────────────────────────────────
  drawText('Item',       50,  y, { size: 10, bold: true })
  drawText('Code',       260, y, { size: 10, bold: true })
  drawText('Qty',        320, y, { size: 10, bold: true })
  drawText('Unit Price', 360, y, { size: 10, bold: true })
  drawText('Credit %',   420, y, { size: 10, bold: true })
  drawText('Amount',     490, y, { size: 10, bold: true })
  y -= 14
  drawLine(50, y, width - 50, y)
  y -= 16

  // ── Line items ───────────────────────────────────────────
  for (const item of memo.items) {
    const name = item.product_name.length > 28
      ? item.product_name.slice(0, 26) + '..'
      : item.product_name

    drawText(name,50,  y, { size: 9 })
    drawText(item.product_code || '-',          260, y, { size: 9 })
    drawText(item.quantity.toString(),          320, y, { size: 9 })
    drawText(fmt(item.unit_price),              360, y, { size: 9 })
    drawText(`${item.credit_percent}%`,         420, y, { size: 9 })
    drawText(`(${fmt(item.line_total)})`,       490, y, { size: 9, color: [0.808, 0.067, 0.149] })
    y -= 18
  }

  // ── Totals ───────────────────────────────────────────────
  y -= 8
  drawLine(350, y, width - 50, y)
  y -= 16

  drawText('Subtotal:',  400, y, { size: 10 })
  drawText(`(${fmt(memo.subtotal)})`, 490, y, { size: 10 })
  y -= 16

  drawText('GST (10%):', 400, y, { size: 10 })
  drawText(`(${fmt(memo.gst_amount)})`, 490, y, { size: 10 })
  y -= 8

  drawLine(350, y, width - 50, y)
  y -= 16

  drawText('Total Credit:', 400, y, { size: 12, bold: true })
  drawText(`(${fmt(memo.total_amount)})`, 490, y, {
    size: 12, bold: true, color: [0.808, 0.067, 0.149]
  })

  // ── Notes ────────────────────────────────────────────────
  if (memo.notes) {
    y -= 30
    drawText('Notes:', 50, y, { size: 9, bold: true })
    y -= 14
    drawText(memo.notes, 50, y, { size: 9, color: [0.4, 0.4, 0.4] })
  }

  // ── Footer ───────────────────────────────────────────────
  drawText("Stods Bakery | ABN: [Your ABN]", width / 2 - 80, 30, {
    size: 8, color: [0.5, 0.5, 0.5]
  })

  const pdfBytes = await pdfDoc.save()
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="credit-memo-${memo.memo_number}.pdf"`,
    },
  })
}