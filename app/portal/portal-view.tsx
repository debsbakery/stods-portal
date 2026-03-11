// app/portal/portal-view.tsx
'use client';

import { useState, useEffect } from 'react';
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
  Edit,
  Lock,
  User,
  Phone,
  MapPin,
  CreditCard,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (amount: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);

const fmtDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return dateStr; }
};

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

// ── Root Component ────────────────────────────────────────────────────────────
export default function CustomerPortalView({ data }: { data: PortalData }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'overview' | 'standing' | 'orders' | 'invoices' | 'account'
  >('overview');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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

  function canEditOrder(order: any) {
    if (order.status !== 'pending') return false;
    const cutoff = new Date(`${order.delivery_date}T${order.cutoff_time ?? '17:00:00'}`);
    return currentTime < cutoff;
  }

  function timeUntilCutoff(order: any) {
    const cutoff = new Date(`${order.delivery_date}T${order.cutoff_time ?? '17:00:00'}`);
    const diff = cutoff.getTime() - currentTime.getTime();
    if (diff <= 0) return 'Editing closed';
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h >= 48) return `${Math.floor(h / 24)} days left`;
    if (h > 0) return `${h}h ${m}m left`;
    return `${m} min left`;
  }

  const tabs = [
    { id: 'overview',  label: 'Overview' },
    { id: 'standing',  label: `Standing Orders (${data.standingOrders.length})` },
    { id: 'orders',    label: 'Recent Orders' },
    { id: 'invoices',  label: `Invoices (${data.invoices.length})` },
    { id: 'account',   label: 'Account' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: '#3E1F00' }}>
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

          {/* Tabs */}
          <div className="flex gap-4 mt-4 border-b overflow-x-auto">
            {tabs.map((tab) => (
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

      {/* ── Content ── */}
      <main className="container mx-auto px-4 py-8">
        {activeTab === 'overview' && (
          <OverviewTab data={data} totalOverdue={totalOverdue} />
        )}
        {activeTab === 'standing' && (
          <StandingOrdersTab orders={data.standingOrders} />
        )}
        {activeTab === 'orders' && (
          <RecentOrdersTab
            orders={data.recentOrders}
            canEditOrder={canEditOrder}
            timeUntilCutoff={timeUntilCutoff}
            router={router}
          />
        )}
        {activeTab === 'invoices' && (
          <InvoicesTab invoices={data.invoices} />
        )}
        {activeTab === 'account' && (
          <AccountTab
            customer={data.customer}
            arBalance={data.arBalance}
            totalOverdue={totalOverdue}
          />
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Overview Tab
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ data, totalOverdue }: { data: PortalData; totalOverdue: number }) {
  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/catalog" className="block">
          <button
            className="w-full px-6 py-4 text-white font-semibold rounded-lg shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
            style={{ backgroundColor: '#3E1F00' }}
          >
            Browse Products and Place Order
          </button>
        </a>
        <a href="/portal/standing-orders" className="block">
          <button className="w-full px-6 py-4 bg-yellow-500 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-600 transition flex items-center justify-center gap-2">
            Manage Standing Orders
          </button>
        </a>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <StatCard
          label="Standing Orders"
          value={String(data.standingOrders.filter((o) => o.active).length)}
          sub="Active"
          color="#3E1F00"
          icon={<Package className="h-8 w-8 text-green-600" />}
        />
        <StatCard
          label="Account Balance"
          value={fmt(data.customer.balance)}
          sub={`${data.customer.payment_terms} day terms`}
          color={data.customer.balance > 0 ? '#C4A882' : '#3E1F00'}
          icon={<DollarSign className={`h-8 w-8 ${data.customer.balance > 0 ? 'text-red-600' : 'text-green-600'}`} />}
        />
        <StatCard
          label="Overdue"
          value={fmt(totalOverdue)}
          sub={totalOverdue > 0 ? 'Payment required' : 'All current'}
          color={totalOverdue > 0 ? '#C4A882' : '#3E1F00'}
          icon={<AlertCircle className={`h-8 w-8 ${totalOverdue > 0 ? 'text-red-600' : 'text-green-600'}`} />}
        />
        <StatCard
          label="Recent Orders"
          value={String(data.recentOrders.length)}
          sub="Last 30 days"
          color="#3E1F00"
          icon={<TrendingUp className="h-8 w-8 text-green-600" />}
        />
      </div>

      {/* Overdue warning banner */}
      {totalOverdue > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-red-800">Overdue Balance: {fmt(totalOverdue)}</p>
            <p className="text-sm text-red-600 mt-1">
              Please contact stods bakeryBakery to arrange payment. Ph: (03) 9000 0000
            </p>
          </div>
        </div>
      )}

      {/* Latest invoices preview */}
      {data.invoices.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-bold mb-4">Latest Invoices</h2>
          <div className="space-y-2">
            {data.invoices.slice(0, 5).map((inv: any) => (
              <div key={inv.id} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <span className="font-medium">Invoice #{inv.invoice_number}</span>
                  <span className="text-sm text-gray-500 ml-3">{fmtDate(inv.invoice_date)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{fmt(inv.total_amount)}</span>
                  <a
                    href={`/api/invoice/${inv.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 px-3 py-1 text-sm border rounded hover:bg-gray-50"
                  >
                    <Download className="h-3 w-3" />
                    PDF
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, sub, color, icon,
}: {
  label: string; value: string; sub: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md border-l-4" style={{ borderColor: color }}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
          <p className="text-xs text-gray-500 mt-1">{sub}</p>
        </div>
        {icon}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Standing Orders Tab
// ═══════════════════════════════════════════════════════════════════════════════
function StandingOrdersTab({ orders }: { orders: any[] }) {
  const DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const sorted = [...orders].sort((a, b) => {
    const ai = DAY_ORDER.indexOf((a.delivery_days || '').toLowerCase());
    const bi = DAY_ORDER.indexOf((b.delivery_days || '').toLowerCase());
    return ai - bi;
  });

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6">Standing Orders</h2>

      {sorted.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">No standing orders set up</p>
          <p className="text-gray-400 text-sm mt-2">Contact stods bakeryBakery to set up a standing order</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((order) => {
            const items: any[] = order.standing_order_items || [];
            const total = items.reduce((sum: number, i: any) => {
              const price = i.products?.price ?? i.products?.unit_price ?? 0;
              return sum + price * i.quantity;
            }, 0);

            return (
              <div key={order.id} className={`border rounded-lg overflow-hidden ${!order.active ? 'opacity-60' : ''}`}>
                <div className="p-4 bg-gray-50 flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-lg capitalize">
                        {order.delivery_days || 'Unknown Day'}
                      </h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        order.active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {order.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {items.length} item{items.length !== 1 ? 's' : ''} &middot; Est. {fmt(total)} per delivery
                    </p>
                  </div>
                  {!order.active && (
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Pause className="h-4 w-4" />
                      Paused
                    </div>
                  )}
                </div>

                {items.length > 0 && (
                  <div className="border-t">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left py-2 px-4">Product</th>
                          <th className="text-center py-2 px-4">Qty</th>
                          <th className="text-right py-2 px-4">Unit Price</th>
                          <th className="text-right py-2 px-4">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: any, idx: number) => {
                          const price = item.products?.price ?? item.products?.unit_price ?? 0;
                          return (
                            <tr key={idx} className="border-b last:border-0">
                              <td className="py-2 px-4">{item.products?.name ?? 'Unknown'}</td>
                              <td className="py-2 px-4 text-center">{item.quantity}</td>
                              <td className="py-2 px-4 text-right">{fmt(price)}</td>
                              <td className="py-2 px-4 text-right">{fmt(price * item.quantity)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={3} className="py-2 px-4 font-semibold text-right">Total</td>
                          <td className="py-2 px-4 font-bold text-right" style={{ color: '#3E1F00' }}>
                            {fmt(total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-sm text-gray-500">
        To add, change or pause standing orders please contact stods bakeryBakery directly.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Recent Orders Tab
// ═══════════════════════════════════════════════════════════════════════════════
function RecentOrdersTab({
  orders,
  canEditOrder,
  timeUntilCutoff,
  router,
}: {
  orders: any[];
  canEditOrder: (o: any) => boolean;
  timeUntilCutoff: (o: any) => string;
  router: any;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
            const expanded  = expandedId === order.id;
            const editable  = canEditOrder(order);
            const remaining = timeUntilCutoff(order);

            return (
              <div key={order.id} className="border rounded-lg overflow-hidden">
                <div className="p-4 flex justify-between items-start bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold">Order #{order.id.slice(0, 8).toUpperCase()}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[order.status] ?? 'bg-gray-100 text-gray-800'}`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">Delivery: {fmtDate(order.delivery_date)}</p>

                    {order.status === 'pending' && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-sm">
                        {editable
                          ? <><Clock className="h-3.5 w-3.5 text-orange-500" /><span className="text-orange-600 font-medium">{remaining} to edit</span></>
                          : <><Lock className="h-3.5 w-3.5 text-gray-400" /><span className="text-gray-500">Editing closed</span></>
                        }
                      </div>
                    )}
                  </div>

                  <div className="text-right ml-4">
                    <p className="text-xl font-bold" style={{ color: '#3E1F00' }}>
                      {fmt(order.total_amount)}
                    </p>
                    <p className="text-xs text-gray-500">{order.order_items?.length ?? 0} items</p>
                    <div className="flex gap-2 mt-2 justify-end">
                      {editable && (
                        <button
                          onClick={() => router.push(`/portal/orders/${order.id}/edit`)}
                          className="flex items-center gap-1 px-3 py-1.5 text-white rounded text-sm"
                          style={{ backgroundColor: '#3E1F00' }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(expanded ? null : order.id)}
                        className="px-3 py-1.5 border rounded text-sm hover:bg-gray-100"
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {expanded && order.order_items && (
                  <div className="border-t p-4">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-gray-50">
                        <tr>
                          <th className="text-left py-2 px-3">Product</th>
                          <th className="text-center py-2 px-3">Qty</th>
                          <th className="text-right py-2 px-3">Price</th>
                          <th className="text-right py-2 px-3">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.order_items.map((item: any, i: number) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 px-3">{item.product_name}</td>
                            <td className="py-2 px-3 text-center">{item.quantity}</td>
                            <td className="py-2 px-3 text-right">{fmt(item.unit_price)}</td>
                            <td className="py-2 px-3 text-right">{fmt(item.subtotal ?? item.unit_price * item.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={3} className="py-2 px-3 font-semibold text-right">Total</td>
                          <td className="py-2 px-3 font-bold text-right" style={{ color: '#3E1F00' }}>
                            {fmt(order.total_amount)}
                          </td>
                        </tr>
                      </tfoot>
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

// ═══════════════════════════════════════════════════════════════════════════════
// Invoices Tab
// ═══════════════════════════════════════════════════════════════════════════════
function InvoicesTab({ invoices }: { invoices: any[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6">Invoices</h2>

      {invoices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">No invoices yet</p>
          <p className="text-gray-400 text-sm mt-2">Invoices appear here after delivery and billing</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const expanded = expandedId === inv.id;
            const items: any[] = inv.items || [];

            // GST breakdown
            const gstTotal = items
              .filter((i) => i.gst_applicable)
              .reduce((sum, i) => sum + (i.subtotal ?? 0) * 0.1, 0);
            const exGst = inv.total_amount - gstTotal;

            return (
              <div key={inv.id} className="border rounded-lg overflow-hidden">
                {/* Invoice header row */}
                <div className="p-4 flex justify-between items-center bg-gray-50">
                  <div className="flex items-center gap-4">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-bold text-lg">Invoice #{inv.invoice_number}</p>
                      <p className="text-sm text-gray-500">
                        {fmtDate(inv.invoice_date)} &middot; Delivery {fmtDate(inv.delivery_date)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xl font-bold" style={{ color: '#3E1F00' }}>
                        {fmt(inv.total_amount)}
                      </p>
                      {gstTotal > 0 && (
                        <p className="text-xs text-gray-500">incl. GST {fmt(gstTotal)}</p>
                      )}
                    </div>

                    {/* PDF download */}
                    <a
                      href={`/api/invoice/${inv.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm hover:bg-white transition"
                      title="Download PDF"
                    >
                      <Download className="h-4 w-4" />
                      PDF
                    </a>

                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpandedId(expanded ? null : inv.id)}
                      className="px-3 py-2 border rounded-md hover:bg-white transition"
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Line items */}
                {expanded && (
                  <div className="border-t p-4">
                    {items.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">No line item detail available</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="border-b bg-gray-50">
                          <tr>
                            <th className="text-left py-2 px-3">Product</th>
                            <th className="text-center py-2 px-3">Qty</th>
                            <th className="text-right py-2 px-3">Unit Price</th>
                            <th className="text-center py-2 px-3">GST</th>
                            <th className="text-right py-2 px-3">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item: any, i: number) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-2 px-3">{item.product_name}</td>
                              <td className="py-2 px-3 text-center">{item.quantity}</td>
                              <td className="py-2 px-3 text-right">{fmt(item.unit_price)}</td>
                              <td className="py-2 px-3 text-center">
                                {item.gst_applicable
                                  ? <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                                  : <span className="text-gray-400 text-xs">Free</span>
                                }
                              </td>
                              <td className="py-2 px-3 text-right">{fmt(item.subtotal ?? item.unit_price * item.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t">
                          <tr>
                            <td colSpan={4} className="py-1.5 px-3 text-right text-sm text-gray-600">Subtotal ex-GST</td>
                            <td className="py-1.5 px-3 text-right text-sm">{fmt(exGst)}</td>
                          </tr>
                          {gstTotal > 0 && (
                            <tr>
                              <td colSpan={4} className="py-1.5 px-3 text-right text-sm text-gray-600">GST (10%)</td>
                              <td className="py-1.5 px-3 text-right text-sm">{fmt(gstTotal)}</td>
                            </tr>
                          )}
                          <tr>
                            <td colSpan={4} className="py-2 px-3 text-right font-bold">Total</td>
                            <td className="py-2 px-3 text-right font-bold" style={{ color: '#3E1F00' }}>
                              {fmt(inv.total_amount)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
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

// ═══════════════════════════════════════════════════════════════════════════════
// Account Tab
// ═══════════════════════════════════════════════════════════════════════════════
function AccountTab({
  customer,
  arBalance,
  totalOverdue,
}: {
  customer: PortalData['customer'];
  arBalance: PortalData['arBalance'];
  totalOverdue: number;
}) {
  return (
    <div className="space-y-6">
      {/* Account details */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <User className="h-5 w-5" /> Account Details
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailRow label="Business Name"  value={customer.business_name} />
          <DetailRow label="Contact Name"   value={customer.contact_name || '—'} />
          <DetailRow label="Email"          value={customer.email} />
          <DetailRow label="Phone"          value={customer.phone || '—'} icon={<Phone className="h-4 w-4 text-gray-400" />} />
          <DetailRow label="Address"        value={customer.address || '—'} icon={<MapPin className="h-4 w-4 text-gray-400" />} />
          <DetailRow label="Payment Terms"  value={`${customer.payment_terms} days`} />
          {customer.credit_limit != null && (
            <DetailRow
              label="Credit Limit"
              value={new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(customer.credit_limit)}
              icon={<CreditCard className="h-4 w-4 text-gray-400" />}
            />
          )}
        </dl>
        <p className="mt-6 text-sm text-gray-500">
          To update your account details please contact stods bakeryBakery directly.
        </p>
      </div>

      {/* AR Ageing */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5" /> Account Balance
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Period</th>
                <th className="text-right py-2 px-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              <AgeRow label="Current"        amount={arBalance.current}      />
              <AgeRow label="1–30 days"      amount={arBalance.days_1_30}    overdue />
              <AgeRow label="31–60 days"     amount={arBalance.days_31_60}   overdue />
              <AgeRow label="61–90 days"     amount={arBalance.days_61_90}   overdue />
              <AgeRow label="Over 90 days"   amount={arBalance.days_over_90} overdue />
            </tbody>
            <tfoot className="border-t">
              <tr className="font-bold">
                <td className="py-2 px-3">Total Outstanding</td>
                <td className="py-2 px-3 text-right" style={{ color: arBalance.total_due > 0 ? '#C4A882' : '#3E1F00' }}>
                  {fmt(arBalance.total_due)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {totalOverdue > 0 && (
          <div className="mt-4 p-3 bg-red-50 rounded text-sm text-red-700 border border-red-200">
            Overdue balance of {fmt(totalOverdue)}. Please contact us to arrange payment.
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 font-medium flex items-center gap-1.5">{icon}{value}</dd>
    </div>
  );
}

function AgeRow({ label, amount, overdue }: { label: string; amount: number; overdue?: boolean }) {
  if (amount === 0) return null;
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 px-3">{label}</td>
      <td className={`py-2 px-3 text-right font-medium ${overdue && amount > 0 ? 'text-red-600' : ''}`}>
        {fmt(amount)}
      </td>
    </tr>
  );
}