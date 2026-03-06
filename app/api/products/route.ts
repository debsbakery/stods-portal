export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server';

async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

// GET all products
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServiceClient();

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .order('name');

    if (error) throw error;

    return NextResponse.json({ products: products || [] });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create new product
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient();
    const body = await request.json();

    const { name, price, description, category, image_url, code, gst_applicable } = body;

    if (!name || price === undefined || price === null) {
      return NextResponse.json(
        { error: 'name and price are required' },
        { status: 400 }
      );
    }

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name,
        price,
        description: description || null,
        category:    category    || null,
        image_url:   image_url   || null,
        code:        code        || null, // ✅ This was the missing line
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ product }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating product:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}