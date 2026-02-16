import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    message: 'Orders endpoint - under maintenance',
    orders: [] 
  });
}
