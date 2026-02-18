"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CartItem } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "./date-picker";
import { CartSummary } from "./cart-summary";
import { Loader2, Send } from "lucide-react";

interface OrderFormProps {
  cart: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
}

export function OrderForm({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}: OrderFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [deliveryDate, setDeliveryDate] = useState<Date>();
  const [notes, setNotes] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cart.length === 0) {
      setError("Your cart is empty");
      return;
    }

    if (!deliveryDate) {
      setError("Please select a delivery date");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      // Create or update customer profile
      await supabase.from("customers").upsert({
        id: user.id,
        email: user.email,
        business_name: businessName || null,
      });

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id: user.id,
          customer_email: user.email,
          customer_business_name: businessName || null,
          delivery_date: deliveryDate.toISOString().split("T")[0],
          notes: notes || null,
          total_amount: total,
          status: "pending",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
 unit_price: item.product.price,
subtotal: item.product.price * item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // 🆕 Create AR transaction (invoice)
      try {
        await fetch("/api/ar/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: user.id,
            type: "invoice",
            amount: total,
            invoiceId: order.id,
            dueDate: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days from now (can be customized)
            ).toISOString().split("T")[0],
            description: `Order for delivery on ${deliveryDate.toLocaleDateString("en-AU")}`,
          }),
        });
      } catch (arError) {
        console.error("Failed to create AR transaction (non-fatal):", arError);
        // Don't fail the order if AR fails
      }

      // Send emails via API
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });

      onClearCart();
      router.push(`/order/success?id=${order.id}`);
    } catch (err) {
      console.error("Order submission error:", err);
      setError("Failed to submit order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>📅 Delivery Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name (Optional)</Label>
                <Input
                  id="businessName"
                  placeholder="Your business name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Delivery Date *</Label>
              <DatePicker date={deliveryDate} onDateChange={setDeliveryDate} />
                <p className="text-xs text-muted-foreground">
                  Orders must be placed at least 2 days in advance. No Sunday deliveries.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Order Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Special instructions, delivery preferences, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <CartSummary
            cart={cart}
            onUpdateQuantity={onUpdateQuantity}
            onRemoveItem={onRemoveItem}
          />

          {error && (
            <div className="p-3 rounded-md bg-red-50 text-red-700 border border-red-200 text-sm">
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={loading || cart.length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting Order...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit Order
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}