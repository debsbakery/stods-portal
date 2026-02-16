import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkAdmin } from "@/lib/auth";
import { ArrowLeft, Calendar, Plus } from "lucide-react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// ===========================
// Types
// ===========================

interface StandingOrder {
  id: string;
  customer_id: string;
  delivery_days: string;
  frequency: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  customers: {
    business_name: string;
    email: string;
  };
  standing_order_items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    products: {
      name: string;
      price: number;
      unit_price: number;
    };
  }>;
}
// ===========================
// Server-side Data Fetching
// ===========================



async function getStandingOrdersData() {
  const supabase = await createClient();

  // Fetch all standing orders with customer and product details
  const { data: standingOrders, error } = await supabase
    .from('standing_orders')
    .select(`      *,
      customer:customers(
        id,
        business_name,
        email,
        contact_name,
        phone
      ),
      items:standing_order_items(
        id,
        product_id,
        quantity,
        product:products(
          id,
          name,
          price,
          unit,
          product_number
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching standing orders:', error);
    return { standingOrders: [] };
  }

  return { standingOrders: standingOrders || [] };
}

// ===========================
// Helper Functions
// ===========================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  try {
    return new Date(dateString).toLocaleDateString("en-AU", {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return "—";
  }
}

function capitalizeDay(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function getDayBadgeColor(day: string): string {
  const colors: Record<string, string> = {
    monday: 'bg-blue-100 text-blue-800',
    tuesday: 'bg-green-100 text-green-800',
    wednesday: 'bg-yellow-100 text-yellow-800',
    thursday: 'bg-purple-100 text-purple-800',
    friday: 'bg-pink-100 text-pink-800',
    saturday: 'bg-orange-100 text-orange-800',
    sunday: 'bg-red-100 text-red-800',
  };
  return colors[day.toLowerCase()] || 'bg-gray-100 text-gray-800';
}

// ===========================
// Main Component (Server)
// ===========================

export default async function StandingOrdersPage() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) redirect("/");

  const { standingOrders } = await getStandingOrdersData();

  // Calculate stats
  const activeOrders = standingOrders.filter(so => so.active).length;
  const totalCustomers = new Set(standingOrders.map(so => so.customer_id)).size;
  const totalItems = standingOrders.reduce((sum, so) => sum + (so.items?.length || 0), 0);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <a
          href="/admin"
          className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
          style={{ color: "#CE1126" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </a>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Calendar className="h-8 w-8" style={{ color: "#006A4E" }} />
              Standing Orders
            </h1>
            <p className="text-gray-600">
              Manage recurring weekly orders for customers
            </p>
          </div>
          <Link
            href="/admin/standing-orders/create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold hover:opacity-90"
            style={{ backgroundColor: "#006A4E" }}
          >
            <Plus className="h-5 w-5" />
            Create Standing Order
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <div
          className="bg-white rounded-lg shadow-md p-6 border-l-4"
          style={{ borderColor: "#006A4E" }}
        >
          <p className="text-sm text-gray-600">Active Standing Orders</p>
          <p className="text-3xl font-bold" style={{ color: "#006A4E" }}>
            {activeOrders}
          </p>
        </div>
        <div
          className="bg-white rounded-lg shadow-md p-6 border-l-4"
          style={{ borderColor: "#CE1126" }}
        >
          <p className="text-sm text-gray-600">Customers with Standing Orders</p>
          <p className="text-3xl font-bold" style={{ color: "#CE1126" }}>
            {totalCustomers}
          </p>
        </div>
        <div
          className="bg-white rounded-lg shadow-md p-6 border-l-4"
          style={{ borderColor: "#FFD700" }}
        >
          <p className="text-sm text-gray-600">Total Products</p>
          <p className="text-3xl font-bold">
            {totalItems}
          </p>
        </div>
      </div>

      {/* Standing Orders Table */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">All Standing Orders</h2>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Delivery Day</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Est. Weekly Total</TableHead>
                <TableHead>Next Generation</TableHead>
                <TableHead>Last Generated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standingOrders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-gray-500"
                  >
                    No standing orders yet. Click "Create Standing Order" to get started.
                  </TableCell>
                </TableRow>
              ) : (
                standingOrders.map((order) => {
                  const estimatedTotal = order.items?.reduce(
                    (sum: number, item: any) => 
                      sum + (item.quantity * (item.product?.price || 0)),
                    0
                  ) || 0;

                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {order.customer?.business_name || "—"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {order.customer?.contact_name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {order.customer?.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getDayBadgeColor(order.delivery_day)}`}
                        >
                          {capitalizeDay(order.delivery_day)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {order.items && order.items.length > 0 ? (
                            <div className="space-y-1">
                              {order.items.slice(0, 3).map((item: any) => (
                                <div key={item.id} className="flex items-center gap-2">
                                  <span className="font-medium">{item.quantity}×</span>
                                  <span className="text-gray-600">
                                    {item.product?.name || 'Unknown'}
                                  </span>
                                </div>
                              ))}
                              {order.items.length > 3 && (
                                <p className="text-xs text-gray-500">
                                  + {order.items.length - 3} more items
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">No items</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(estimatedTotal)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {formatDate(order.next_generation_date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-500">
                          {formatDate(order.last_generated_date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {order.active ? (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-green-100 text-green-800">
                            ✅ Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-800">
                            ⏸️ Paused
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Link
                            href={`/admin/standing-orders/edit/${order.id}`}
                            className="text-sm px-3 py-1.5 rounded-md text-white hover:opacity-90"
                            style={{ backgroundColor: "#006A4E" }}
                          >
                            ✏️ Edit
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Manual Generation Section */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Manual Generation
        </h3>
        <p className="text-sm text-gray-700 mb-4">
          Standing orders are automatically generated daily at 12:01 AM. 
          You can also trigger generation manually below.
        </p>
        <StandingOrderActions />
      </div>
    </div>
  );
}