import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, email, business_name, balance')
      .gt('balance', 0)

    if (customersError) {
      return NextResponse.json(
        { error: 'Failed to fetch customers' },
        { status: 500 }
      )
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        message: 'No customers with outstanding balances',
      })
    }

    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const customer of customers) {
      try {
        console.log(\Would send statement to \ (\)\)
        console.log(\Balance: \$\\)
        
        sent++
      } catch (error: any) {
        console.error(\Failed to send statement to \:\, error)
        failed++
        errors.push(\\: \\)
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: customers.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Send all statements error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send statements' },
      { status: 500 }
    )
  }
}
