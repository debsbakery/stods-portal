"use client";

export const dynamic = 'force-dynamic'

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CartItem, Customer } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import {
  ArrowLeft, Trash2, Plus, Minus, Loader2, Send,
  Calendar as CalendarIcon, ShoppingCart, MapPin, Phone, Building, CreditCard,
} from "lucide-react";
import { addDays, format } from "date-fns";

const GST_RATE = 0.10;

export default function OrderPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<any>(null);

  const [cart, setCart]                           = useState<CartItem[]>([]);
  const [deliveryDate, setDeliveryDate]           = useState<Date>();
  const [notes, setNotes]                         = useState("");
  const [customer, setCustomer]                   = useState<Customer | null>(null);
  const [businessName, setBusinessName]           = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [docketNumber, setDocketNumber]           = useState("");
  const [loading, setLoading]                     = useState(false);
  const [pageLoading, setPageLoading]             = useState(true);
  const [error, setError]                         = useState<string | null>(null);
  const [showCalendar, setShowCalendar]           = useState(false);

  useEffect(() => {
    setSupabase(createClient());
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const init = async () => {
      const savedCart = localStorage.getItem("cart");
      if (savedCart) {
        try { setCart(JSON.parse(savedCart)); } catch (e) { console.error(e); }
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: custById } = await supabase
            .from("customers")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

          const finalCust = custById ?? (await supabase
            .from("customers")
            .select("*")
            .eq("email", user.email)
            .single()
          ).data;

          if (finalCust) {
            setCustomer(finalCust);
            setBusinessName(finalCust.business_name || "");
          }
        }
      } catch (e) {
        console.error("Error loading customer:", e);
      }

      setPageLoading(false);
    };

    init();
  }, [supabase]);

  const saveCart = (newCart: CartItem[]) => {
  setCart(newCart);
  localStorage.setItem("cart", JSON.stringify(newCart));
  window.dispatchEvent(new Event('cart-changed'));
};

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    const newCart = cart.map((item) =>
      item.product.id === productId ? { ...item, quantity } : item
    );
    saveCart(newCart);
  };

  const handleRemoveItem = (productId: string) => {
    const newCart = cart.filter((item) => item.product.id !== productId);
    saveCart(newCart);
  };

  const orderTotals = cart.reduce(
    (acc, item) => {
      const lineTotal = Number(item.product.price) * item.quantity;
      const lineGST   = item.product.gst_applicable ? lineTotal * GST_RATE : 0;
      return {
        subtotal:  acc.subtotal  + lineTotal,
        gstAmount: acc.gstAmount + lineGST,
        total:     acc.total     + lineTotal + lineGST,
      };
    },
    { subtotal: 0, gstAmount: 0, total: 0 }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase)        return;
    if (cart.length === 0) { setError("Your cart is empty");           return; }
    if (!deliveryDate)     { setError("Please select a delivery date"); return; }

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }

      const customerId = customer?.id ?? user.id

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id:            customerId,
          customer_email:         user.email!,
          customer_business_name: businessName || null,
          customer_address:       customer?.address || null,
          customer_abn:           customer?.abn    || null,
          delivery_date:          format(deliveryDate, 'yyyy-MM-dd'),
          notes:                  notes                || null,
          purchase_order_number:  purchaseOrderNumber  || null,
          docket_number:          docketNumber         || null,
          total_amount:           orderTotals.total,
          status:                 "pending",
          source:                 "online",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map((item) => {
        const lineTotal = Number(item.product.price) * item.quantity;
        const lineGST   = item.product.gst_applicable ? lineTotal * GST_RATE : 0;
        return {
          order_id:       order.id,
          product_id:     item.product.id,
          product_name:   item.product.name,
          quantity:       item.quantity,
          unit_price:     Number(item.product.price),
          subtotal:       lineTotal + lineGST,
          gst_applicable: item.product.gst_applicable || false,
        };
      });

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
        await fetch(`${siteUrl}/api/orders/send-confirmation`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId:       order.id,
            customerEmail: user.email,
            businessName:  businessName || null,
            deliveryDate:  format(deliveryDate, 'yyyy-MM-dd'),
            total:         orderTotals.total,
          }),
        });
      } catch (emailErr) {
        console.error("Email error (non-fatal):", emailErr);
      }

     localStorage.removeItem("cart");
setCart([]);
window.dispatchEvent(new Event('cart-changed'));   // notify cart cleared
      window.location.href = `/order/success?id=${order.id}`;

    } catch (err: any) {
      console.error("Order error:", err);
      setError("Failed to submit order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getAvailableDates = (cutoffTime?: string) => {
    const dates = []
    const nowUtc = new Date()
    const nowBrisbane = new Date(nowUtc.getTime() + 10 * 60 * 60 * 1000)
    const cutoffHour = cutoffTime ? parseInt(cutoffTime.split(':')[0], 10) : 14
    const todayHour = nowBrisbane.getUTCHours()
    const daysToAdd = todayHour < cutoffHour ? 1 : 2

    let currentDate = addDays(nowBrisbane, daysToAdd)
    for (let i = 0; i < 14; i++) {
      if (currentDate.getUTCDay() !== 0) {
        dates.push(new Date(currentDate))
      }
      currentDate = addDays(currentDate, 1)
    }
    return dates
  }

  const availableDates = getAvailableDates(
    (customer as any)?.cutoff_time ?? (customer as any)?.default_cutoff_time ?? undefined
  )

  if (!supabase || pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-12 w-12 animate-spin" style={{ color: "#CE1126" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <Link href="/catalog">
          <button className="flex items-center hover:opacity-80 mb-6" style={{ color: "#CE1126" }}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Catalog
          </button>
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Complete Your Order</h1>
          <p className="text-gray-600">Review your items and select a delivery date</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">

            {/* LEFT — Delivery Details */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Delivery Details
                </h2>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Business Name
                  </label>
                  <input
                    type="text"
                    placeholder="Your business name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                {customer && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-md text-sm text-gray-600 space-y-1">
                    {customer.address && (
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        {customer.address}
                      </p>
                    )}
                    {customer.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400" />
                        {customer.phone}
                      </p>
                    )}
                    {customer.abn && (
                      <p className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-gray-400" />
                        ABN: {customer.abn}
                      </p>
                    )}
                    {customer.payment_terms && (
                      <p className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-gray-400" />
                        Payment terms: {customer.payment_terms} days
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Purchase Order Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., PO-2024-1234"
                      value={purchaseOrderNumber}
                      onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Docket Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., DOC-5678"
                      value={docketNumber}
                      onChange={(e) => setDocketNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Delivery Date *
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowCalendar(!showCalendar)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <span className={deliveryDate ? "text-gray-900" : "text-gray-400"}>
                        {deliveryDate ? format(deliveryDate, "EEEE, MMMM d, yyyy") : "Select delivery date"}
                      </span>
                      <CalendarIcon className="h-5 w-5 text-gray-400" />
                    </button>

                    {showCalendar && (
                      <div className="absolute z-10 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4 max-h-64 overflow-y-auto w-full">
                        <div className="grid gap-2">
                          {availableDates.map((date) => (
                            <button
                              key={date.toISOString()}
                              type="button"
                              onClick={() => { setDeliveryDate(date); setShowCalendar(false); }}
                              className={`px-4 py-2 text-left rounded-md transition-colors ${
                                deliveryDate && date.toDateString() === deliveryDate.toDateString()
                                  ? "text-white"
                                  : "hover:bg-gray-100"
                              }`}
                              style={
                                deliveryDate && date.toDateString() === deliveryDate.toDateString()
                                  ? { backgroundColor: "#CE1126" }
                                  : {}
                              }
                            >
                              {format(date, "EEEE, MMMM d, yyyy")}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    No Sunday deliveries.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Order Notes (Optional)
                  </label>
                  <textarea
                    placeholder="Special instructions, delivery preferences..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT — Order Summary */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Order Summary
                  <span className="ml-1 text-sm font-normal text-gray-600">
                    ({cart.length} item{cart.length !== 1 ? "s" : ""})
                  </span>
                </h2>

                {cart.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                    <p>Your cart is empty.</p>
                    <Link href="/catalog">
                      <button type="button" className="mt-4 font-medium" style={{ color: "#CE1126" }}>
                        Browse Catalog
                      </button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cart.map((item) => {
                      const lineTotal = Number(item.product.price) * item.quantity;
                      const lineGST   = item.product.gst_applicable ? lineTotal * GST_RATE : 0;
                      return (
                        <div key={item.product.id} className="flex items-center gap-3 pb-3 border-b">
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              {item.product.name}
                              {item.product.gst_applicable && (
                                <span className="ml-1 text-xs text-orange-600 font-normal">(incl. GST)</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatCurrency(Number(item.product.price))} × {item.quantity}
                              {lineGST > 0 && (
                                <span className="text-orange-600"> + {formatCurrency(lineGST)} GST</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)}
                              disabled={item.quantity <= item.product.min_quantity}
                              className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-8 text-center text-sm">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)}
                              disabled={item.quantity >= item.product.max_quantity}
                              className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="w-20 text-right font-medium text-sm">
                            {formatCurrency(lineTotal + lineGST)}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.product.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}

                    <div className="pt-2 space-y-1">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Subtotal</span>
                        <span>{formatCurrency(orderTotals.subtotal)}</span>
                      </div>
                      {orderTotals.gstAmount > 0 && (
                        <div className="flex justify-between text-sm text-orange-600">
                          <span>GST (10%)</span>
                          <span>{formatCurrency(orderTotals.gstAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-lg font-bold pt-2 border-t" style={{ color: "#CE1126" }}>
                        <span>Total</span>
                        <span>{formatCurrency(orderTotals.total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-md bg-red-50 text-red-700 border border-red-200 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || cart.length === 0}
                className="w-full text-white py-3 px-6 rounded-md hover:opacity-90 disabled:opacity-50 font-medium flex items-center justify-center gap-2 shadow-md"
                style={{ backgroundColor: "#CE1126" }}
              >
                {loading ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Submitting...</>
                ) : (
                  <><Send className="h-5 w-5" /> Submit Order</>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}