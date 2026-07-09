// app/api/statement/[customerId]/open-invoices/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { buildOpenStatement } from '@/lib/statement/build-open-statement'
import { generateOpenInvoicesPDF } from '@/lib/pdf/open-invoices'

interface RouteParams {
  params: Promise<{ customerId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { customerId } = await params

    const data = await buildOpenStatement(customerId)

    // Debug mode: ?debug=1 returns JSON instead of PDF
    if (request.nextUrl.searchParams.get('debug') === '1') {
      return NextResponse.json(data)
    }

    const pdfBuffer = await generateOpenInvoicesPDF(data)

    const safeName = (data.customer.business_name || customerId)
      .replace(/[^a-z0-9]/gi, '-').toLowerCase()

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="open-invoices-${safeName}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Open invoices error:', error)
    const status = error.message?.includes('not found') ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
}