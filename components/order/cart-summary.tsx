"use client";

import { CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus, Minus } from "lucide-react";

interface CartSummaryProps {
  cart: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
}

export function CartSummary({ cart, onUpdateQuantity, onRemoveItem }: CartSummaryProps) {
  const total = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  if (cart.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <div className="text-4xl mb-2">🛒</div>
          Your cart is empty. Add some bread!
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          🛒 Order Summary
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {cart.length} item{cart.length !== 1 ? "s" : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {cart.map((item) => (
          <div key={item.product.id} className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  onUpdateQuantity(item.product.id, item.quantity - 1)
                }
                disabled={item.quantity <= item.product.min_quantity}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-8 text-center text-sm">{item.quantity}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  onUpdateQuantity(item.product.id, item.quantity + 1)
                }
                disabled={item.quantity >= item.product.max_quantity}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            
            <div className="flex-1">
              <p className="font-medium">{item.product.name}</p>
              <div className="text-sm text-gray-600">
                {item.quantity} × {formatCurrency(item.product.price)}
              </div>
            </div>
            
            <p className="w-20 text-right font-medium">
              {formatCurrency(item.product.price * item.quantity)}
            </p>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onRemoveItem(item.product.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        
        <Separator />
        
        <div className="flex justify-between items-center text-lg font-bold">
          <span>Total</span>
          <span className="text-amber-700">{formatCurrency(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}