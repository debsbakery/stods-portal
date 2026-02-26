'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Clock, Users, BarChart3, Package, RefreshCw, Truck,
  DollarSign, FileText, ShoppingCart, ChefHat, Receipt,
  Copy, Play, FileMinus,
} from 'lucide-react';

import OrdersView from './orders-view';
import StandingOrdersView from './standing-orders-view';
import ContractPricingPage from './pricing/page';
import ProductsView from './products-view';

type Tab = 'orders' | 'standing-orders' | 'pricing' | 'products';

export default function AdminClientView() {
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const supabase = createClient();
  const [testingStandingOrders, setTestingStandingOrders] = useState(false);

  async function testStandingOrderGeneration() {
    if (!confirm('⚠️ This will generate standing orders for the upcoming week.\n\nContinue?')) return;
    setTestingStandingOrders(true);
    try {
      const response = await fetch('/api/standing-orders/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (data.success) {
        let message = `✅ SUCCESS!\n\n${data.ordersCreated} orders created\n\n`;
        if (data.orders?.length > 0) {
          message += 'Orders:\n';
          data.orders.forEach((order: any) => {
            message += `• ${order.customer} - ${order.deliveryDay} (${order.deliveryDate}) - $${order.total.toFixed(2)}\n`;
          });
        }
        if (data.errors?.length > 0) {
          message += `\n⚠️ ${data.errors.length} error(s) - check console`;
          console.error('Errors:', data.errors);
        }
        alert(message);
        if (data.ordersCreated > 0) window.location.reload();
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setTestingStandingOrders(false);
    }
  }

  // Nav button style helpers
  const linkBtn = (color: string) =>
    `flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90 shadow-md transition-all text-sm font-medium`

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky Header ─────────────────────────────────────────── */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="container mx-auto px-4">

          {/* Top bar */}
          <div className="flex justify-between items-start py-4 gap-4">
            <div className="shrink-0">
              <h1 className="text-2xl font-bold" style={{ color: '#006A4E' }}>
                🍞 Admin Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Deb's Bakery — wholesale operations
              </p>
            </div>

            {/* Action buttons — scrollable on mobile */}
            <div className="flex gap-2 flex-wrap justify-end">

              {/* ── Orders & Invoices ── */}
              <a href="/admin/batch-invoice"
                className={linkBtn('#CE1126')}
                style={{ backgroundColor: '#CE1126' }}>
                <FileText className="h-4 w-4" />Batch Invoice
              </a>

              <a href="/admin/direct-invoice"
                className={linkBtn('#CE1126')}
                style={{ backgroundColor: '#CE1126' }}>
                <Receipt className="h-4 w-4" />Direct Invoice
              </a>

              {/* ── Production ── */}
              <a href="/admin/production"
                className={linkBtn('#006A4E')}
                style={{ backgroundColor: '#006A4E' }}>
                <ChefHat className="h-4 w-4" />Production
              </a>

              {/* ── Customers ── */}
              <a href="/admin/customers"
                className={linkBtn('#006A4E')}
                style={{ backgroundColor: '#0284c7' }}>
                <Users className="h-4 w-4" />Customers
              </a>

              <a href="/admin/customers/pending"
                className={linkBtn('#ea580c')}
                style={{ backgroundColor: '#ea580c' }}>
                <Clock className="h-4 w-4" />Pending
              </a>

              <a href="/admin/customers/repeat-order-search"
                className={linkBtn('#7c3aed')}
                style={{ backgroundColor: '#7c3aed' }}>
                <Copy className="h-4 w-4" />Repeat Order
              </a>

              {/* ── Finance ── */}
              <a href="/admin/ar"
                className={linkBtn('#1f2937')}
                style={{ backgroundColor: '#1f2937' }}>
                <DollarSign className="h-4 w-4" />AR Dashboard
              </a>

              <a href="/admin/payments/record"
                className={linkBtn('#16a34a')}
                style={{ backgroundColor: '#16a34a' }}>
                <DollarSign className="h-4 w-4" />Record Payment
              </a>

              <a href="/admin/gst-report"
                className={linkBtn('#7c3aed')}
                style={{ backgroundColor: '#7c3aed' }}>
                <BarChart3 className="h-4 w-4" />GST Report
              </a>

              {/* ── Logistics ── */}
              <a href="/admin/routes"
                className={linkBtn('#CE1126')}
                style={{ backgroundColor: '#CE1126' }}>
                <Truck className="h-4 w-4" />Routes
              </a>

              {/* ── Standing Orders Test ── */}
              <button
                onClick={testStandingOrderGeneration}
                disabled={testingStandingOrders}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {testingStandingOrders
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />Generating...</>
                  : <><Play className="h-4 w-4" />Test S/O</>
                }
              </button>

            </div>
          </div>

          {/* ── Tab Navigation ─────────────────────────────────────── */}
          <div className="flex gap-0 overflow-x-auto">
            {([
              { id: 'orders',          icon: <Package className="h-4 w-4" />,      label: 'Orders' },
              { id: 'standing-orders', icon: <RefreshCw className="h-4 w-4" />,    label: 'Standing Orders' },
              { id: 'products',        icon: <ShoppingCart className="h-4 w-4" />, label: 'Products' },
              { id: 'pricing',         icon: <DollarSign className="h-4 w-4" />,   label: 'Contract Pricing' },
            ] as { id: Tab; icon: React.ReactNode; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm whitespace-nowrap transition-all border-b-2 ${
                  activeTab === tab.id
                    ? 'border-green-600 text-green-700 bg-green-50'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────────────── */}
      <div className="container mx-auto px-4 py-6">
        {activeTab === 'orders'          && <OrdersView supabase={supabase} />}
        {activeTab === 'standing-orders' && <StandingOrdersView supabase={supabase} />}
        {activeTab === 'products'        && <ProductsView />}
        {activeTab === 'pricing'         && <ContractPricingPage />}
      </div>

    </div>
  );
}