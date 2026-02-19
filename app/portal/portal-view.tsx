'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package,
  Calendar,
  DollarSign,
  FileText,
  Bell,
  LogOut,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  Download,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RefreshCw,
} from 'lucide-react';

interface PortalData {
  customer: {
    id: string;
    business_name: string;
    contact_name: string;
    email: string;
    phone: string;
    address: string;
    payment_terms: number;
    credit_limit: number | null;
    balance: number;
  };
  standingOrders: any[];
  recentOrders: any[];
  arBalance: {
    current: number;
    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_over_90: number;
    total_due: number;
  };
  invoices: any[];
  notifications: any[];
}

export default function CustomerPortalView({ data }: { data: PortalData }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'standing' | 'orders' | 'invoices' | 'account'>('overview');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const handleLogout = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const totalOverdue = 
    data.arBalance.days_1_30 +
    data.arBalance.days_31_60 +
    data.arBalance.days_61_90 +
    data.arBalance.days_over_90;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#006A4E" }}>
                Customer Portal
              </h1>
              <p className="text-sm text-gray-600">{data.customer.business_name}</p>
            </div>

            <div className="flex gap-3">
              {data.notifications.length > 0 && (
                <button className="relative p-2 rounded-full hover:bg-gray-100">
                  <Bell className="h-5 w-5 text-gray-600" />
                  <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                    {data.notifications.length}
                  </span>
                </button>
              )}

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-4 mt-4 border-b overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'standing', label: `Standing Orders (${data.standingOrders.length})` },
              { id: 'orders', label: 'Recent Orders' },
              { id: 'invoices', label: `Invoices (${data.invoices.length})` },
              { id: 'account', label: 'Account' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 px-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

           {/* Content */}
      <main className="container mx-auto px-4 py-8">
        
        {/* Quick Actions - ADD THIS SECTION */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <a href="/catalog">
              <button className="w-full px-6 py-4 text-white font-semibold rounded-lg shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
                style={{ backgroundColor: '#006A4E' }}>
                <span className="text-2xl">🛒</span>
                <span>Browse Products & Place Order</span>
              </button>
            </a>
            
            <a href="/order/shadow">
              <button className="w-full px-6 py-4 bg-yellow-500 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-600 transition flex items-center justify-center gap-2">
                <span className="text-2xl">⭐</span>
                <span>My Usual Items (Quick Order)</span>
              </button>
            </a>
          </div>
        )}

        
        {activeTab === 'overview' && (
          <OverviewTab data={data} formatCurrency={formatCurrency} formatDate={formatDate} totalOverdue={totalOverdue} />
        )}
        {activeTab === 'standing' && (
          <StandingOrdersTab
            orders={data.standingOrders}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        )}
        {activeTab === 'orders' && (
          <RecentOrdersTab orders={data.recentOrders} formatCurrency={formatCurrency} formatDate={formatDate} />
        )}
        {activeTab === 'invoices' && (
          <InvoicesTab invoices={data.invoices} formatCurrency={formatCurrency} formatDate={formatDate} />
        )}
        {activeTab === 'account' && (
          <AccountTab customer={data.customer} arBalance={data.arBalance} formatCurrency={formatCurrency} totalOverdue={totalOverdue} />
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════
// Overview Tab
// ═══════════════════════════════════════════
function OverviewTab({ 
  data, 
  formatCurrency, 
  formatDate,
  totalOverdue 
}: { 
  data: PortalData; 
  formatCurrency: (n: number) => string;
  formatDate: (s: string) => string;
  totalOverdue: number;
}) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-md border-l-4" style={{ borderColor: "#006A4E" }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Standing Orders</p>
              <p className="text-3xl font-bold mt-1">{data.standingOrders.length}</p>
              <p className="text-xs text-gray-500 mt-1">Active</p>
            </div>
            <Package className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border-l-4" style={{ borderColor: data.customer.balance > 0 ? "#CE1126" : "#006A4E" }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Account Balance</p>
              <p className="text-3xl font-bold mt-1" style={{ color: data.customer.balance > 0 ? "#CE1126" : "#006A4E" }}>
                {formatCurrency(data.customer.balance)}
              </p>
              <p className="text-xs text-gray-500 mt-1">{data.customer.payment_terms} day terms</p>
            </div>
            <DollarSign className={`h-8 w-8 ${data.customer.balance > 0 ? 'text-red-600' : 'text-green-600'}`} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border-l-4" style={{ borderColor: totalOverdue > 0 ? "#CE1126" : "#FFD700" }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Overdue Amount</p>
              <p className="text-3xl font-bold mt-1" style={{ color: totalOverdue > 0 ? "#CE1126" : "#006A4E" }}>
                {formatCurrency(totalOverdue)}
              </p>
              {totalOverdue > 0 && (
                <p className="text-xs text-red-600 mt-1">⚠️ Payment required</p>
              )}
            </div>
            <AlertCircle className={`h-8 w-8 ${totalOverdue > 0 ? 'text-red-600' : 'text-yellow-600'}`} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border-l-4" style={{ borderColor: "#006A4E" }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Recent Orders</p>
              <p className="text-3xl font-bold mt-1">{data.recentOrders.length}</p>
              <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
        </div>
      </div>

      {/* Notifications */}
      {data.notifications.length > 0 && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
          <div className="flex">
            <Bell className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900">You have {data.notifications.length} new notification(s)</h3>
              <div className="mt-2 space-y-2">
                {data.notifications.map((notif) => (
                  <div key={notif.id} className="text-sm text-blue-800">
                    <strong>{notif.title}</strong>
                    {notif.message && <p className="text-blue-700">{notif.message}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Grid */}
 
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" style={{ color: "#006A4E" }} />
            Upcoming Deliveries
          </h3>
          {data.standingOrders.length === 0 ? (
            <p className="text-gray-500 text-sm">No active standing orders</p>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <div>
                  <p className="font-medium">{data.standingOrders.length} delivery days configured</p>
                  <p className="text-sm text-gray-600">Weekly standing orders</p>
                </div>
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" style={{ color: "#006A4E" }} />
            Recent Activity
          </h3>
          {data.recentOrders.length === 0 ? (
            <p className="text-gray-500 text-sm">No recent orders</p>
          ) : (
            <div className="space-y-3">
              {data.recentOrders.slice(0, 3).map((order) => (
                <div key={order.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium">Order #{order.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-sm text-gray-600">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold" style={{ color: "#006A4E" }}>
                      {formatCurrency(order.total_amount)}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{order.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Standing Orders Tab (WITH PAUSE/RESUME)
// ═══════════════════════════════════════════
function StandingOrdersTab({ 
  orders, 
  formatCurrency, 
  formatDate 
}: { 
  orders: any[];
  formatCurrency: (n: number) => string;
  formatDate: (s: string) => string;
}) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const safeOrders = Array.isArray(orders) ? orders : [];

  const ordersByDay = safeOrders.reduce((acc, order) => {
    const day = order.delivery_days || 'unknown';
    acc[day] = order;
    return acc;
  }, {} as Record<string, any>);

  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  // Toggle pause/resume for a standing order
  const handleToggleActive = async (orderId: string, currentStatus: boolean) => {
    console.log('🔄 Attempting to toggle:', { orderId, currentStatus, newStatus: !currentStatus });

    setProcessingId(orderId);

    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      console.log('👤 Current user:', { userId: user?.id, email: user?.email });

      const { data, error } = await supabase
        .from('standing_orders')
        .update({ active: !currentStatus })
        .eq('id', orderId)
        .select();

      console.log('📊 Update result:', { data, error, rowsAffected: data?.length });

      if (error) {
        console.error('❌ Error:', error);
        alert(`Failed: ${error.message}`);
      } else if (!data || data.length === 0) {
        console.error('❌ No rows updated');
        alert('Unable to update. Permission denied.');
      } else {
        console.log('✅ Success');
        window.location.reload();
      }
    } catch (err) {
      console.error('❌ Exception:', err);
      alert('An error occurred.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6">Standing Orders</h2>
      
      {safeOrders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">No standing orders configured</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-blue-800 font-semibold">
                  ✅ You have <strong>{safeOrders.length} delivery days</strong> configured
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  💡 You can pause or resume deliveries. To change items, contact us.
                </p>
              </div>
            </div>
          </div>

          {weekdays.map((day) => {
            const order = ordersByDay[day];
            if (!order) return null;

            const isExpanded = expandedOrder === order.id;
            const isProcessing = processingId === order.id;
            const items = order.standing_order_items || [];
            const totalValue = items.reduce((sum: number, item: any) => 
              sum + (item.quantity * (item.products?.unit_price || 0)), 0
            );

            return (
              <div key={order.id} className={`border rounded-lg overflow-hidden ${
                order.active ? 'border-gray-200' : 'border-gray-300 bg-gray-50 opacity-75'
              }`}>
                <div className="p-4 bg-gray-50 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      order.active ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <Calendar className={`h-6 w-6 ${
                        order.active ? 'text-green-600' : 'text-gray-400'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold capitalize">{day}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          order.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                        }`}>
                          {order.active ? '✓ Active' : '⏸ Paused'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {order.frequency} • {items.length} items
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`text-2xl font-bold ${
                      order.active ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {formatCurrency(totalValue)}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                        className="px-3 py-1 text-sm bg-white border rounded-md hover:bg-gray-50 flex items-center gap-1"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {isExpanded ? 'Hide' : 'View'}
                      </button>

                      <button
                        onClick={() => handleToggleActive(order.id, order.active)}
                        disabled={isProcessing}
                        className={`px-3 py-1 text-sm rounded-md font-semibold flex items-center gap-1 disabled:opacity-50 ${
                          order.active
                            ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800'
                            : 'bg-green-100 hover:bg-green-200 text-green-800'
                        }`}
                      >
                        {isProcessing ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            {order.active ? 'Pausing...' : 'Resuming...'}
                          </>
                        ) : order.active ? (
                          <>
                            <Pause className="h-4 w-4" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Resume
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 border-t bg-white">
                    <h4 className="font-semibold mb-3">Items:</h4>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr className="text-left">
                          <th className="py-2 px-3">Product</th>
                          <th className="py-2 px-3 text-center">Quantity</th>
                          <th className="py-2 px-3 text-right">Unit Price</th>
                          <th className="py-2 px-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: any, idx: number) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3">{item.products?.name || 'Unknown'}</td>
                            <td className="py-2 px-3 text-center font-semibold">{item.quantity}</td>
                            <td className="py-2 px-3 text-right">
                              {formatCurrency(item.products?.unit_price || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-semibold">
                              {formatCurrency(item.quantity * (item.products?.unit_price || 0))}
                            </td>
                          </tr>
                        ))}
                        <tr className="font-bold bg-gray-50">
                          <td colSpan={3} className="py-2 px-3 text-right">Total:</td>
                          <td className="py-2 px-3 text-right text-green-600">
                            {formatCurrency(totalValue)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {!order.active && (
                  <div className="px-4 py-3 bg-yellow-50 border-t border-yellow-200">
                    <p className="text-sm text-yellow-800">
                      ⏸ <strong>Paused.</strong> You won't receive orders on {day.charAt(0).toUpperCase() + day.slice(1)} until you resume.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-700 mb-1">Total Weekly Value</p>
                <p className="text-3xl font-bold text-green-700">
                  {formatCurrency(
                    safeOrders
                      .filter(o => o.active)
                      .reduce((sum, order) => {
                        const items = order.standing_order_items || [];
                        return sum + items.reduce((itemSum: number, item: any) => 
                          itemSum + (item.quantity * (item.products?.unit_price || 0)), 0
                        );
                      }, 0)
                  )}
                </p>
                <p className="text-xs text-gray-600 mt-1">(Active only)</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Active Days</p>
                <p className="text-2xl font-bold text-gray-800">
                  {safeOrders.filter(o => o.active).length} / {safeOrders.length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Recent Orders Tab
// ═══════════════════════════════════════════
function RecentOrdersTab({ 
  orders, 
  formatCurrency, 
  formatDate 
}: { 
  orders: any[];
  formatCurrency: (n: number) => string;
  formatDate: (s: string) => string;
}) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6">Recent Orders (Last 30 Days)</h2>
      
      {orders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">No recent orders</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isExpanded = expandedOrder === order.id;
            
            return (
              <div key={order.id} className="border rounded-lg">
                <div className="p-4 flex justify-between items-start bg-gray-50">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">
                      Order #{order.id.slice(0, 8).toUpperCase()}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Delivery: {formatDate(order.delivery_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold" style={{ color: "#006A4E" }}>
                      {formatCurrency(order.total_amount)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {order.order_items?.length || 0} items
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  className="w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2 border-t"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {isExpanded ? 'Hide' : 'View'} Details
                </button>

                {isExpanded && order.order_items && (
                  <div className="border-t p-4">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-gray-50">
                        <tr className="text-left">
                          <th className="py-2 px-3">Product</th>
                          <th className="py-2 px-3 text-center">Quantity</th>
                          <th className="py-2 px-3 text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.order_items.map((item: any, idx: number) => (
                          <tr key={idx} className="border-b">
                            <td className="py-2 px-3">{item.product_name}</td>
                            <td className="py-2 px-3 text-center">{item.quantity}</td>
                            <td className="py-2 px-3 text-right">{formatCurrency(item.unit_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Invoices Tab
// ═══════════════════════════════════════════
function InvoicesTab({ 
  invoices, 
  formatCurrency, 
  formatDate 
}: { 
  invoices: any[];
  formatCurrency: (n: number) => string;
  formatDate: (s: string) => string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6">Invoices</h2>
      
      {invoices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">No invoices</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b-2">
              <tr className="text-left">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Download</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">#{invoice.id.slice(0, 8).toUpperCase()}</td>
                  <td className="py-3 px-4">{formatDate(invoice.created_at)}</td>
                  <td className="py-3 px-4 text-right font-semibold">
                    {formatCurrency(invoice.total_amount)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <a
                      href={`/api/invoice/${invoice.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-white text-sm"
                      style={{ backgroundColor: "#CE1126" }}
                    >
                      <Download className="h-4 w-4" />
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Account Tab
// ═══════════════════════════════════════════
function AccountTab({ 
  customer, 
  arBalance, 
  formatCurrency,
  totalOverdue 
}: { 
  customer: any;
  arBalance: any;
  formatCurrency: (n: number) => string;
  totalOverdue: number;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-6">Account Information</h2>
        <dl className="grid md:grid-cols-2 gap-6">
          <div>
            <dt className="text-sm font-medium text-gray-600 mb-1">Business Name</dt>
            <dd className="text-lg font-semibold">{customer.business_name}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-600 mb-1">Email</dt>
            <dd className="text-lg font-semibold">{customer.email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-600 mb-1">Phone</dt>
            <dd className="text-lg font-semibold">{customer.phone || '—'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-600 mb-1">Payment Terms</dt>
            <dd className="text-lg font-semibold">{customer.payment_terms} days</dd>
          </div>
        </dl>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-bold mb-4">Account Balance</h3>
        <p className="text-4xl font-bold" style={{ color: customer.balance > 0 ? "#CE1126" : "#006A4E" }}>
          {formatCurrency(customer.balance)}
        </p>
      </div>
    </div>
  );
}