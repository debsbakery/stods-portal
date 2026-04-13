import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const {
      ingredient_id,
      supplier_id,
      packs,
      pack_size_kg,
      cost_per_pack,
      invoice_ref,
      received_date,
      notes
    } = body;

    if (!ingredient_id || !packs || !pack_size_kg || !cost_per_pack) {
      return NextResponse.json(
        { error: 'Missing required fields: ingredient_id, packs, pack_size_kg, cost_per_pack' },
        { status: 400 }
      );
    }

    const quantity_kg = packs * pack_size_kg;
    const total_cost = packs * cost_per_pack;
    const unit_cost = cost_per_pack / pack_size_kg;

    const { data: receipt, error: receiptError } = await supabase
      .from('ingredient_receipts')
      .insert([
        {
          ingredient_id,
          supplier_id: supplier_id || null,
          packs,
          pack_size_kg,
          cost_per_pack,
          quantity_kg,
          unit_cost,
          total_cost,
          invoice_ref: invoice_ref || null,
          received_date: received_date || new Date().toISOString().split('T')[0],
          notes: notes || null,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (receiptError) {
      console.error('Receipt insert error:', receiptError);
      throw receiptError;
    }

    const { data: ingredient } = await supabase
      .from('ingredients')
      .select('current_stock, unit_cost')
      .eq('id', ingredient_id)
      .single();

    if (ingredient) {
      const newStock = (ingredient.current_stock || 0) + quantity_kg;
      
      const oldValue = (ingredient.current_stock || 0) * (ingredient.unit_cost || 0);
      const newValue = quantity_kg * unit_cost;
      const newUnitCost = (oldValue + newValue) / newStock;

      const { error: updateError } = await supabase
        .from('ingredients')
        .update({
          current_stock: newStock,
          unit_cost: newUnitCost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ingredient_id);

      if (updateError) {
        console.error('Stock update error:', updateError);
        throw updateError;
      }
    }

    return NextResponse.json({ success: true, data: receipt });
  } catch (error: any) {
    console.error('Receive delivery error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to receive delivery' },
      { status: 500 }
    );
  }
}
