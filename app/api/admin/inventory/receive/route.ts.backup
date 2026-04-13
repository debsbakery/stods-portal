import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const {
    ingredient_id,
    supplier_id,
    packs,           // ✅ NEW
    pack_size_kg,    // ✅ NEW
    cost_per_pack,   // ✅ NEW
    quantity_kg,
    unit_cost,
    total_cost,
    invoice_ref,
    received_date,
    notes
  } = await request.json();

  if (!ingredient_id || !quantity_kg || !unit_cost) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    // Insert receipt
    const { error: receiptError } = await supabase
      .from('ingredient_receipts')
      .insert({
        ingredient_id,
        supplier_id: supplier_id || null,
        quantity_kg,
        unit_cost,
        total_cost,
        packs,           // ✅ NEW
        pack_size_kg,    // ✅ NEW
        cost_per_pack,   // ✅ NEW
        invoice_ref: invoice_ref || null,
        received_date,
        notes: notes || null,
      });

    if (receiptError) throw receiptError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Receive delivery error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}