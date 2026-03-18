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
  ChefHat, ShoppingBag,
} from "lucide-react";
import {
  format, isValid, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay,
} from "date-fns";

const GST_RATE = 0.10;
type OrderCategory = 'bakery' | 'catering' | null

// ── Brand colors ──────────────────────────────────────────
const PRIMARY   = '#3E1F00'   // dark brown
const SECONDARY = '#C4A882'   // tan/gold

// ── Date generation ───────────────────────────────────────
function getAvailableDates(cat: OrderCategory, cutoffTime?: string): Date[] {
  if (!cat) return []
  try {
    const dates: Date[] = []
    const now   = new Date()
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Brisbane',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)
    const get = (type: string) =>
      parseInt(parts.find(p => p.type === type)?.value || '0')

    const brisbaneYear  = get('year')
    const brisbaneMonth = get('month') - 1
    const brisbaneDay   = get('day')
    const brisbaneHour  = get('hour')

    const todayMidnight = new Date(brisbaneYear, brisbaneMonth, brisbaneDay, 0, 0, 0, 0)

    let daysToAdd:   number
    let daysForward: number
    if (cat === 'catering') {
      daysToAdd   = 2
      daysForward = 90
    } else {
      const cutoffHour = cutoffTime ? parseInt(cutoffTime.split(':')[0], 10) : 14
      daysToAdd   = brisbaneHour < cutoffHour ? 1 : 2
      daysForward = 21
    }

    let cursor = new Date(todayMidnight)
    cursor.setDate(cursor.getDate() + daysToAdd)
    let added = 0, safety = 0
    while (added < daysForward && safety < 300) {
      safety++
      if (cursor.getDay() !== 0) { dates.push(new Date(cursor)); added++ }
      cursor.setDate(cursor.getDate() + 1)
    }
    return dates
  } catch (err) {
    console.error('getAvailableDates error:', err)
    return []
  }
}

// ── CalendarPicker ────────────────────────────────────────
function CalendarPicker({
  availableDates, selectedDate, onSelect, accentColor,
}: {
  availableDates: Date[]
  selectedDate:   Date | undefined
  onSelect:       (date: Date) => void
  accentColor:    string
}) {
  const availableSet   = new Set(availableDates.map(d => format(d, 'yyyy-MM-dd')))
  const firstAvailable = availableDates[0] ?? new Date()
  const lastAvailable  = availableDates[availableDates.length - 1] ?? new Date()

  const [viewYear,  setViewYear]  = useState(firstAvailable.getFullYear())
  const [viewMonth, setViewMonth] = useState(firstAvailable.getMonth())

  const viewDate   = new Date(viewYear, viewMonth, 1)
  const monthStart = startOfMonth(viewDate)
  const monthEnd   = endOfMonth(viewDate)
  const allDays    = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad   = (monthStart.getDay() + 6) % 7

  const firstAvailableMonth = new Date(firstAvailable.getFullYear(), firstAvailable.getMonth(), 1)
  const lastAvailableMonth  = new Date(lastAvailable.getFullYear(),  lastAvailable.getMonth(),  1)
  const canGoPrev = viewDate > firstAvailableMonth
  const canGoNext = viewDate < lastAvailableMonth

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 text-white"
        style={{ backgroundColor: accentColor }}>
        <button type="button" onClick={prevMonth} disabled={!canGoPrev}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-30 text-lg font-bold">
          ‹
        </button>
        <span className="font-semibold text-sm">{format(viewDate, 'MMMM yyyy')}</span>
        <button type="button" onClick={nextMonth} disabled={!canGoNext}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-30 text-lg font-bold">
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
        {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 p-2 gap-1">
        {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
        {allDays.map(day => {
          const key        = format(day, 'yyyy-MM-dd')
          const isAvail    = availableSet.has(key)
          const isSelected = selectedDate && isSameDay(day, selectedDate)
          const isSunday   = day.getDay() === 0
          return (
            <button
              key={key}
              type="button"
              disabled={!isAvail}
              onMouseDown={(e) => {
                e.preventDefault()
                if (isAvail) onSelect(new Date(day))
              }}
              className={`h-9 w-full rounded-md text-sm font-medium transition-colors
                ${isSelected
                  ? 'text-white font-bold'
                  : isAvail
                    ? 'hover:bg-gray-100 text-gray-800 cursor-pointer'
                    : isSunday
                      ? 'text-gray-200 cursor-not-allowed'
                      : 'text-gray-300 cursor-not-allowed'
                }`}
              style={isSelected ? { backgroundColor: accentColor } : {}}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────
export default function OrderPage() {
  const router = useRouter();
  const [supabase, setSupabase]                       = useState<any>(null);
  const [category, setCategory]                       = useState<OrderCategory>(null)
  const [availableDates, setAvailableDates]           = useState<Date[]>([])
  const [cart, setCart]                               = useState<CartItem[]>([]);
  const [deliveryDate, setDeliveryDate]               = useState<Date | undefined>(undefined);
  const [notes, setNotes]                             = useState("");
  const [customer, setCustomer]                       = useState<Customer | null>(null);
  const [businessName, setBusinessName]               = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [docketNumber, setDocketNumber]               = useState("");
  const [loading, setLoading]                         = useState(false);
  const [pageLoading, setPageLoading]                 = useState(true);
  const [error, setError]                             = useState<string | null>(null);

  useEffect(() => { setSupabase(createClient()); }, []);

  useEffect(() => {
    if (!supabase) return;
    const init = async () => {
      const savedCart = localStorage.getItem("cart");
      if (savedCart) {
        try { setCart(JSON.parse(savedCart)); } catch (e) { console.error(e); }
      }
      const savedCategory = localStorage.getItem("cart_category") as OrderCategory
      if (savedCategory === 'bakery' || savedCategory === 'catering') {
        setCategory(savedCategory)
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: custById } = await supabase
            .from("customers").select("*").eq("id", user.id).maybeSingle();
          const finalCust = custById ?? (await supabase
            .from("customers").select("*").eq("email", user.email).maybeSingle()
          ).data;
          if (finalCust) {
            setCustomer(finalCust);
            setBusinessName(finalCust.business_name || "");
          }
        }
      } catch (e) { console.error("Error loading customer:", e); }
      setPageLoading(false);
    };
    init();
  }, [supabase]);

  useEffect(() => {
    if (!category) { setAvailableDates([]); return }
    setAvailableDates(getAvailableDates(
      category,
      (customer as any)?.cutoff_time ??
      (customer as any)?.default_cutoff_time ?? undefined
    ))
  }, [category, customer])

  const handleSelectCategory = (cat: OrderCategory) => {
    setCategory(cat)
    setDeliveryDate(undefined)
    setCart([])
    localStorage.removeItem("cart")
    if (cat) {
      localStorage.setItem("cart_category", cat)
      setAvailableDates(getAvailableDates(
        cat,
        (customer as any)?.cutoff_time ??
        (customer as any)?.default_cutoff_time ?? undefined
      ))
    } else {
      localStorage.removeItem("cart_category")
      setAvailableDates([])
    }
  }

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    localStorage.setItem("cart", JSON.stringify(newCart));
  };
  const handleUpdateQuantity = (productId: string, quantity: number) =>
    saveCart(cart.map(item => item.product.id === productId ? { ...item, quantity } : item));
  const handleRemoveItem = (productId: string) =>
    saveCart(cart.filter(item => item.product.id !== productId));

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
    if (!supabase)         return;
    if (cart.length === 0) { setError("Your cart is empty");            return; }
    if (!deliveryDate)     { setError("Please select a delivery date"); return; }
    setLoading(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const customerId = customer?.id ?? user.id
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id:            customerId,
          customer_email:         user.email!,
          customer_business_name: businessName        || null,
          customer_address:       customer?.address   || null,
          customer_abn:           customer?.abn       || null,
          delivery_date:          format(deliveryDate, 'yyyy-MM-dd'),
          notes:                  notes               || null,
          purchase_order_number:  purchaseOrderNumber || null,
          docket_number:          docketNumber        || null,
          total_amount:           orderTotals.total,
          status:                 "pending",
          source:                 "online",
          category:               category,
        })
        .select().single();
      if (orderError) throw orderError;

      const { error: itemsError } = await supabase.from("order_items").insert(
        cart.map(item => {
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
        })
      );
      if (itemsError) throw itemsError;

      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/api/orders/send-confirmation`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId:       order.id,
              customerEmail: user.email,
              businessName:  businessName || null,
              deliveryDate:  format(deliveryDate, 'yyyy-MM-dd'),
              total:         orderTotals.total,
            }),
          }
        );
      } catch (emailErr) { console.error("Email error (non-fatal):", emailErr); }

      localStorage.removeItem("cart");
      localStorage.removeItem("cart_category");
      window.location.href = `/order/success?id=${order.id}`;
    } catch (err: any) {
      console.error("Order error:", err);
      setError("Failed to submit order. Please try again.");
    } finally { setLoading(false); }
  };

  // ── Loading ───────────────────────────────────────────────
  if (!supabase || pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-12 w-12 animate-spin" style={{ color: SECONDARY }} />
      </div>
    );
  }

  // ── Category picker ───────────────────────────────────────
  if (!category) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">What are you ordering?</h1>
            <p className="text-gray-500">Select a category to see available products</p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <button onClick={() => handleSelectCategory('bakery')}
              className="bg-white rounded-2xl shadow-md p-8 flex flex-col items-center gap-4 hover:shadow-lg transition-all border-2 border-transparent hover:border-gray-300 group">
              <div className="w-16 h-16 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform"
                style={{ backgroundColor: PRIMARY }}>
                <ShoppingBag className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">Bakery</p>
                <p className="text-xs text-gray-500 mt-1">Order by 2pm the day before</p>
              </div>
            </button>
            <button onClick={() => handleSelectCategory('catering')}
              className="bg-white rounded-2xl shadow-md p-8 flex flex-col items-center gap-4 hover:shadow-lg transition-all border-2 border-transparent hover:border-gray-300 group">
              <div className="w-16 h-16 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform"
                style={{ backgroundColor: SECONDARY }}>
                <ChefHat className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">Catering</p>
                <p className="text-xs text-gray-500 mt-1">Order at least 2 days ahead</p>
              </div>
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-8">
            You can go back and change category at any time
          </p>
        </div>
      </div>
    )
  }

  // ── Main order form ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">

        <div className="flex items-center gap-4 mb-6">
          <Link href="/catalog">
            <button className="flex items-center hover:opacity-80" style={{ color: SECONDARY }}>
              <ArrowLeft className="h-4 w-4 mr-2" />Back to Catalog
            </button>
          </Link>
          <span className="text-gray-300">|</span>
          <button onClick={() => handleSelectCategory(null)}
            className="text-sm hover:opacity-80 text-gray-500">
            Change category
          </button>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-3xl font-bold">Complete Your Order</h1>
          <span className="px-3 py-1 rounded-full text-white text-sm font-semibold capitalize"
            style={{ backgroundColor: category === 'catering' ? SECONDARY : PRIMARY }}>
            {category === 'catering' ? '🍽️' : '🍞'} {category}
          </span>
        </div>
        <p className="text-gray-600 mb-6">Review your items and select a delivery date</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">

            {/* LEFT */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4">📅 Delivery Details</h2>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Business Name</label>
                  <input type="text" placeholder="Your business name" value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                    style={{ outlineColor: PRIMARY }} />
                </div>

                {customer && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
                    {customer.address       && <p>📍 {customer.address}</p>}
                    {customer.phone         && <p>📞 {customer.phone}</p>}
                    {customer.abn           && <p>🏢 ABN: {customer.abn}</p>}
                    {customer.payment_terms && <p>💳 Payment terms: {customer.payment_terms} days</p>}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Order (Optional)</label>
                    <input type="text" placeholder="e.g., PO-2024-1234" value={purchaseOrderNumber}
                      onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Docket Number (Optional)</label>
                    <input type="text" placeholder="e.g., DOC-5678" value={docketNumber}
                      onChange={(e) => setDocketNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2" />
                  </div>
                </div>

                {/* Delivery Date */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Date *</label>
                  <div className="mb-2 px-3 py-2 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: category === 'catering' ? '#fdf6ec' : '#f5f0eb',
                      color:           category === 'catering' ? SECONDARY   : PRIMARY,
                    }}>
                    {category === 'catering'
                      ? '⏰ Catering orders require at least 2 days notice'
                      : '⏰ Bakery orders must be placed by 2pm the day before delivery'}
                  </div>

                  {availableDates.length > 0 ? (
                    <CalendarPicker
                      availableDates={availableDates}
                      selectedDate={deliveryDate}
                      onSelect={(date) => setDeliveryDate(date)}
                      accentColor={category === 'catering' ? SECONDARY : PRIMARY}
                    />
                  ) : (
                    <div className="p-4 text-center text-gray-400 border border-gray-200 rounded-lg">
                      Loading available dates...
                    </div>
                  )}

                  {deliveryDate && isValid(deliveryDate) && (
                    <div className="mt-2 px-3 py-2 rounded-md text-sm font-medium text-white text-center"
                      style={{ backgroundColor: category === 'catering' ? SECONDARY : PRIMARY }}>
                      ✅ {format(deliveryDate, "EEEE, MMMM d, yyyy")}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">No Sunday deliveries.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Order Notes (Optional)</label>
                  <textarea placeholder="Special instructions..." value={notes}
                    onChange={(e) => setNotes(e.target.value)} rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2" />
                </div>
              </div>
            </div>

            {/* RIGHT */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4">
                  🛒 Order Summary
                  <span className="ml-2 text-sm font-normal text-gray-600">
                    ({cart.length} item{cart.length !== 1 ? "s" : ""})
                  </span>
                </h2>

                {cart.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">🛒</div>
                    <p>Your cart is empty.</p>
                    <Link href="/catalog">
                      <button type="button" className="mt-4 font-medium"
                        style={{ color: SECONDARY }}>
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
                            <button type="button"
                              onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)}
                              disabled={item.quantity <= item.product.min_quantity}
                              className="p-1 hover:bg-gray-100 rounded disabled:opacity-50">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-8 text-center text-sm">{item.quantity}</span>
                            <button type="button"
                              onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)}
                              disabled={item.quantity >= item.product.max_quantity}
                              className="p-1 hover:bg-gray-100 rounded disabled:opacity-50">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="w-20 text-right font-medium text-sm">
                            {formatCurrency(lineTotal + lineGST)}
                          </p>
                          <button type="button"
                            onClick={() => handleRemoveItem(item.product.id)}
                            className="p-1 hover:bg-red-50 rounded"
                            style={{ color: SECONDARY }}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                    <div className="pt-2 space-y-1">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Subtotal</span><span>{formatCurrency(orderTotals.subtotal)}</span>
                      </div>
                      {orderTotals.gstAmount > 0 && (
                        <div className="flex justify-between text-sm text-orange-600">
                          <span>GST (10%)</span><span>{formatCurrency(orderTotals.gstAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-lg font-bold pt-2 border-t"
                        style={{ color: PRIMARY }}>
                        <span>Total</span><span>{formatCurrency(orderTotals.total)}</span>
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

              <button type="submit" disabled={loading || cart.length === 0}
                className="w-full text-white py-3 px-6 rounded-md hover:opacity-90 disabled:opacity-50 font-medium flex items-center justify-center gap-2 shadow-md"
                style={{ backgroundColor: PRIMARY }}>
                {loading
                  ? <><Loader2 className="h-5 w-5 animate-spin" /> Submitting...</>
                  : <><Send className="h-5 w-5" /> Submit Order</>
                }
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}