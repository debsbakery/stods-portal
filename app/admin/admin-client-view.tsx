'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Clock,
  Users,
  BarChart3,
  Package, 
  RefreshCw,
  Truck,
  DollarSign,
  FileText,
  ShoppingCart,
  ChefHat,
  Receipt,
  Copy,
  Play,  // ✅ ADDFileMinus,  // ← add this
 FileMinus,  // ← add this
} from 'lucide-react';

// Import views
import OrdersView from './orders-view';
import StandingOrdersView from './standing-orders-view';
import ContractPricingPage from './pricing/page';
import ProductsView from './products-view';

export default function AdminClientView() {
  const [activeTab, setActiveTab] = useState<'orders' | 'standing-orders' | 'pricing' | 'products'>('orders');
  const supabase = createClient();
  
  // ✅ ADD: Test standing orders state
  const [testingStandingOrders, setTestingStandingOrders] = useState(false);

  // ✅ ADD: Test standing order generation function
  async function testStandingOrderGeneration() {
    if (!confirm('⚠️ This will generate standing orders for the upcoming week.\n\nContinue?')) {
      return;
    }

    setTestingStandingOrders(true);
    
    try {
      const response = await fetch('/api/standing-orders/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Standing Order Generation Result:', data);
        
        let message = `✅ SUCCESS!\n\n${data.ordersCreated} orders created\n\n`;
        
        if (data.orders && data.orders.length > 0) {
          message += 'Orders:\n';
          data.orders.forEach((order: any) => {
            message += `• ${order.customer} - ${order.deliveryDay} (${order.deliveryDate}) - $${order.total.toFixed(2)}\n`;
          });
        }
        
        if (data.errors && data.errors.length > 0) {
          message += `\n⚠️ ${data.errors.length} error(s) - check console`;
          console.error('Errors:', data.errors);
        }
        
        alert(message);
        
        // Refresh the page to show new orders
        if (data.ordersCreated > 0) {
          window.location.reload();
        }
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (error: any) {
      console.error('❌ Standing order generation error:', error);
      alert(`❌ Error: ${error.message}\n\nCheck console for details.`);
    } finally {
      setTestingStandingOrders(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Action Buttons */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="container mx-auto px-4">
          {/* Top Bar with Buttons */}
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: '#006A4E' }}>
                Admin Dashboard
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Manage your wholesale bakery operations
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 flex-wrap">
              {/* ✅ ADD: Test Standing Orders Button */}
              <button
                onClick={testStandingOrderGeneration}
                disabled={testingStandingOrders}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-md transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
                title="Manually trigger standing order generation for testing"
              >
                {testingStandingOrders ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Test Standing Orders
                  </>
                )}
              </button>

              {/* Production Button */}
              <a
                href="/admin/production"
                className="flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90 shadow-md transition-all"
                style={{ backgroundColor: '#006A4E' }}
              >
                <ChefHat className="h-4 w-4" />
                Production
              </a>

              {/* Batch Invoice Button */}
              <a
                href="/admin/batch-invoice"
                className="flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90 shadow-md transition-all"
                style={{ backgroundColor: '#CE1126' }}
              >
                <FileText className="h-4 w-4" />
                Batch Invoice
              </a>

              {/* Direct Invoice Button */}
              <a
                href="/admin/direct-invoice"
                className="flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90 shadow-md transition-all"
                style={{ backgroundColor: '#CE1126' }}
              >
                <Receipt className="h-4 w-4" />
                Direct Invoice
              </a>
{/* GST Report Button */}
<a
  href="/admin/gst-report"
  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 shadow-md transition-all"
>
  <BarChart3 className="h-4 w-4" />
  GST Report
</a>
<a
  href="/admin/customers/pending"
  className="flex items-center gap-2 px-4 py-2 text-white text-sm rounded-md hover:opacity-90 shadow-md"
  style={{ backgroundColor: '#ea580c' }}
>
  <Clock className="h-4 w-4" />
  Pending Approvals
</a>
            {/* Repeat Order Button */}
<a
  href="/admin/customers/repeat-order-search"
  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 shadow-md transition-all"
>
  <Copy className="h-4 w-4" />
  Repeat Order
</a>
// Find the navigation buttons section and add this:
<button
  onClick={() => setActiveTab('customers')}
  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
    activeTab === 'customers'
      ? 'text-white'
      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
  }`}
  style={activeTab === 'customers' ? { backgroundColor: '#006A4E' } : {}}
>
  <Users className="h-4 w-4" />
  Customers
</button>
{/* ✅ Product Management Button */}
<a
  href="/admin/products"
  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 shadow-md transition-all"
>
  <Package className="h-4 w-4" />
  Products
</a>
              {/* Routes Button */}
              <a
                href="/admin/routes"
                className="flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90 shadow-md transition-all"
                style={{ backgroundColor: '#CE1126' }}
              >
                <Truck className="h-4 w-4" />
                Routes
              </a>

              {/* AR Dashboard Button */}
              <a
                href="/admin/ar"
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 shadow-md transition-all"
              >
                <DollarSign className="h-4 w-4" />
                AR Dashboard
              </a>

              {/* Record Payment Button */}
              <a
                href="/admin/payments/record"
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 shadow-md transition-all"
              >
                <DollarSign className="h-4 w-4" />
                Record Payment
              </a>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 overflow-x-auto pb-0">
            {/* Orders Tab */}
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm whitespace-nowrap transition-all border-b-2 ${
                activeTab === 'orders'
                  ? 'border-green-600 text-green-700 bg-green-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Package className="h-4 w-4" />
              Orders
            </button>

            {/* Standing Orders Tab */}
            <button
              onClick={() => setActiveTab('standing-orders')}
              className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm whitespace-nowrap transition-all border-b-2 ${
                activeTab === 'standing-orders'
                  ? 'border-green-600 text-green-700 bg-green-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              Standing Orders
            </button>

            {/* Products Tab */}
            <button
              onClick={() => setActiveTab('products')}
              className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm whitespace-nowrap transition-all border-b-2 ${
                activeTab === 'products'
                  ? 'border-green-600 text-green-700 bg-green-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              Products
            </button>

            {/* Contract Pricing Tab */}
            <button
              onClick={() => setActiveTab('pricing')}
              className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm whitespace-nowrap transition-all border-b-2 ${
                activeTab === 'pricing'
                  ? 'border-green-600 text-green-700 bg-green-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <DollarSign className="h-4 w-4" />
              Contract Pricing
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="container mx-auto px-4 py-6">
        {activeTab === 'orders' && <OrdersView supabase={supabase} />}
        {activeTab === 'standing-orders' && <StandingOrdersView supabase={supabase} />}
        {activeTab === 'products' && <ProductsView />}
        {activeTab === 'pricing' && <ContractPricingPage />}
      </div>
    </div>
  );
}
