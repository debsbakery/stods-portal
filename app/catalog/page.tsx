"use client";

export const dynamic = 'force-dynamic'

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Product, CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import {
  ShoppingCart, Search, Loader2, Plus, Minus,
  ArrowLeft, Image as ImageIcon, ShoppingBag, ChefHat,
  Star,
} from "lucide-react";

const PRIMARY   = "#3E1F00"   // Stods dark brown
const SECONDARY = "#C4A882"   // Stods warm tan
type OrderCategory = 'bakery' | 'catering'

interface ProductWithPricing extends Product {
  customerPrice?: number;
  isContractPrice?: boolean;
}

export default function CatalogPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<any>(null);

  const [orderCategory, setOrderCategory] = useState<OrderCategory | null>(null)

  const [products, setProducts]                       = useState<ProductWithPricing[]>([]);
  const [cart, setCart]                               = useState<CartItem[]>([]);
  const [loading, setLoading]                         = useState(true);
  const [error, setError]                             = useState<string | null>(null);
  const [searchQuery, setSearchQuery]                 = useState("");
  const [showOnlyShadowItems, setShowOnlyShadowItems] = useState(false);
  const [shadowProductIds, setShadowProductIds]       = useState<Set<string>>(new Set());

  useEffect(() => { setSupabase(createClient()); }, []);

  useEffect(() => {
    const saved = localStorage.getItem("cart_category") as OrderCategory | null
    if (saved) setOrderCategory(saved)
  }, [])

  const handleSelectCategory = (cat: OrderCategory) => {
    setOrderCategory(cat)
    localStorage.setItem("cart_category", cat)
    setCart([])
    localStorage.removeItem("cart")
    window.dispatchEvent(new Event('cart-changed'))
  }

  const loadShadowProductIds = async () => {
    try {
      const res  = await fetch("/api/shadow-orders");
      const data = await res.json();
      if (Array.isArray(data)) {
        setShadowProductIds(new Set<string>(
          data.map((item: any) => item.products?.id).filter(Boolean)
        ));
      } else if (data.success && data.items) {
        setShadowProductIds(new Set<string>(
          data.items.map((item: any) => item.product_id)
        ));
      }
    } catch (error) {
      console.error("Error loading shadow products:", error);
    }
  };

  useEffect(() => {
    if (!supabase || !orderCategory) return;

    const fetchProducts = async () => {
      setLoading(true)
      try {
        const { data, error: fetchError } = await supabase
          .from("products")
          .select("*")
          .eq("is_available", true)
          .eq("category", orderCategory)
          .neq("category", "admin")              // ✅ never show admin products
          .order("code", { ascending: true })

        if (fetchError) { setError(fetchError.message); setLoading(false); return; }
        if (!data || data.length === 0)  { setProducts([]); setLoading(false); return; }

        const productIds = data.map((p: any) => p.id);
        const pricingRes = await fetch("/api/pricing", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ productIds }),
        });

        if (!pricingRes.ok) { setProducts(data); setLoading(false); return; }

        const pricingData = await pricingRes.json();
        setProducts(data.map((product: any) => ({
          ...product,
          customerPrice:
            pricingData.pricing[product.id]?.price !== undefined
              ? pricingData.pricing[product.id].price
              : parseFloat(product.price),
          isContractPrice: pricingData.pricing[product.id]?.isContractPrice || false,
          image_url:       product.image_url || null,
        })));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
      try { setCart(JSON.parse(savedCart)); } catch (e) { console.error(e); }
    }

    fetchProducts();
    loadShadowProductIds();
  }, [supabase, orderCategory]);

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    localStorage.setItem("cart", JSON.stringify(newCart));
    window.dispatchEvent(new Event('cart-changed'))   // ✅ notify cart badge
  };

  const handleAddToCart = (product: ProductWithPricing, quantity: number) => {
    const existingIndex = cart.findIndex(item => item.product.id === product.id);
    const productForCart = { ...product, price: product.customerPrice ?? product.price };
    let newCart: CartItem[];
    if (existingIndex >= 0) {
      newCart = [...cart];
      newCart[existingIndex] = { product: productForCart as Product, quantity };
    } else {
      newCart = [...cart, { product: productForCart as Product, quantity }];
    }
    saveCart(newCart);
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesShadow = !showOnlyShadowItems || shadowProductIds.has(product.id);
    return matchesSearch && matchesShadow;
  });

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: PRIMARY }} />
      </div>
    );
  }

  // ── Category picker screen ──────────────────────────────────────────────────
  if (!orderCategory) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              What are you ordering?
            </h1>
            <p className="text-gray-500">Select a category to browse products</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Bakery */}
            <button
              onClick={() => handleSelectCategory('bakery')}
              className="bg-white rounded-2xl shadow-md p-8 flex flex-col items-center gap-4 hover:shadow-lg transition-all border-2 border-transparent hover:border-gray-200 group"
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform"
                style={{ backgroundColor: PRIMARY }}
              >
                <ShoppingBag className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">Bakery</p>
                <p className="text-xs text-gray-500 mt-1">Order by 2pm the day before</p>
              </div>
            </button>

            {/* Catering */}
            <button
              onClick={() => handleSelectCategory('catering')}
              className="bg-white rounded-2xl shadow-md p-8 flex flex-col items-center gap-4 hover:shadow-lg transition-all border-2 border-transparent hover:border-gray-200 group"
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform"
                style={{ backgroundColor: SECONDARY }}
              >
                <ChefHat className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">Catering</p>
                <p className="text-xs text-gray-500 mt-1">Order at least 2 days ahead</p>
              </div>
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">
            You can change category at any time
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-12 w-12 animate-spin" style={{ color: PRIMARY }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-2" style={{ color: PRIMARY }}>
            Error Loading Products
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 text-white rounded-md"
            style={{ backgroundColor: PRIMARY }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">

        {/* Back + Change category */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push("/portal")}                      
            className="flex items-center"
            style={{ color: PRIMARY }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Portal
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => {
              setOrderCategory(null)
              localStorage.removeItem("cart_category")
              setCart([])
              localStorage.removeItem("cart")
              window.dispatchEvent(new Event('cart-changed'))
            }}
            className="text-sm text-gray-500 hover:opacity-80"
          >
            Change category
          </button>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Product Catalog</h1>
              <span
                className="px-3 py-1 rounded-full text-white text-sm font-semibold capitalize flex items-center gap-1.5"
                style={{ backgroundColor: orderCategory === 'catering' ? SECONDARY : PRIMARY }}
              >
                {orderCategory === 'catering'
                  ? <ChefHat className="h-3.5 w-3.5" />
                  : <ShoppingBag className="h-3.5 w-3.5" />
                }
                {orderCategory}
              </span>
            </div>
            {shadowProductIds.size > 0 && (
              <p className="text-gray-600 mt-1">
                <a href="/order/shadow" className="text-blue-600 hover:underline">
                  Manage my usual items ({shadowProductIds.size})
                </a>
              </p>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            {shadowProductIds.size > 0 && (
              <button
                onClick={() => setShowOnlyShadowItems(!showOnlyShadowItems)}
                className={`px-6 py-3 rounded-md font-medium flex items-center gap-2 shadow-md ${
                  showOnlyShadowItems ? "bg-yellow-500 text-white" : "bg-white text-gray-700 border-2"
                }`}
              >
                <Star className="h-4 w-4 fill-current" />
                {showOnlyShadowItems
                  ? `Showing My Usual (${filteredProducts.length})`
                  : "Show My Usual"
                }
              </button>
            )}
            <button
              onClick={() => router.push("/order")}
              className="relative text-white px-6 py-3 rounded-md font-medium flex items-center gap-2 shadow-md"
              style={{ backgroundColor: orderCategory === 'catering' ? SECONDARY : PRIMARY }}
            >
              <ShoppingCart className="h-5 w-5" />
              View Order
              {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${orderCategory} products...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
            />
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-md">
            <Search className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <p className="text-xl text-gray-600 mb-2">
              No {orderCategory} products found
            </p>
            <p className="text-sm text-gray-400">
              Products will appear here once they are added to the catalog
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={handleAddToCart}
                currentQuantity={cart.find(item => item.product.id === product.id)?.quantity || 0}
                onFavoriteAdded={loadShadowProductIds}
                isFavorite={shadowProductIds.has(product.id)}
                primaryColor={PRIMARY}
                secondaryColor={SECONDARY}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProductCard Component
// ─────────────────────────────────────────────────────────────────────────────
function ProductCard({
  product, onAddToCart, currentQuantity, onFavoriteAdded, isFavorite,
  primaryColor, secondaryColor,
}: {
  product: ProductWithPricing;
  onAddToCart: (product: ProductWithPricing, quantity: number) => void;
  currentQuantity: number;
  onFavoriteAdded?: () => void;
  isFavorite?: boolean;
  primaryColor: string;
  secondaryColor: string;
}) {
  const [quantity, setQuantity]     = useState(currentQuantity || product.min_quantity);
  const [imageError, setImageError] = useState(false);
  const [adding, setAdding]         = useState(false);

  const handleQuantityChange = (value: number) => {
    setQuantity(Math.max(product.min_quantity, Math.min(product.max_quantity, value)));
  };

  const displayPrice = product.customerPrice ?? parseFloat(product.price as any);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow">
      <div className="aspect-square bg-gray-100 relative">
        {product.image_url && !imageError ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #FEE7E9 0%, #E6F5F0 100%)" }}
          >
            <ImageIcon className="h-16 w-16 text-gray-300" />
          </div>
        )}
        {isFavorite && (
          <div className="absolute top-2 right-2 bg-yellow-400 text-white p-1.5 rounded-full shadow-md">
            <Star className="h-4 w-4 fill-current" />
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-lg">{product.name}</h3>
          {product.code && (
            <span className="text-xs text-gray-400 font-mono">#{product.code}</span>
          )}
        </div>

        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.description}</p>

        <div className="flex justify-between items-center mb-3">
          <span
            className={`text-2xl font-bold ${product.isContractPrice ? "text-blue-600" : ""}`}
            style={!product.isContractPrice ? { color: primaryColor } : {}}
          >
            {formatCurrency(displayPrice)}
          </span>
          <span className="text-sm text-gray-500">per {product.unit}</span>
        </div>

        {product.isContractPrice && (
          <p className="text-xs text-blue-600 font-medium mb-2">
            Your contract price
          </p>
        )}

        <p className="text-xs text-gray-500 mb-3">
          Min: {product.min_quantity} | Max: {product.max_quantity}
        </p>

        <div className="flex gap-2">
          <div className="flex items-center border-2 rounded-md" style={{ borderColor: primaryColor }}>
            <button
              onClick={() => handleQuantityChange(quantity - 1)}
              disabled={quantity <= product.min_quantity}
              className="p-2 hover:bg-gray-100 disabled:opacity-50"
            >
              <Minus className="h-4 w-4" style={{ color: primaryColor }} />
            </button>
            <input
              type="number"
              value={quantity}
              onChange={(e) => handleQuantityChange(parseInt(e.target.value) || product.min_quantity)}
              className="w-16 text-center border-0 focus:outline-none"
              min={product.min_quantity}
              max={product.max_quantity}
            />
            <button
              onClick={() => handleQuantityChange(quantity + 1)}
              disabled={quantity >= product.max_quantity}
              className="p-2 hover:bg-gray-100 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" style={{ color: primaryColor }} />
            </button>
          </div>

          <button
            onClick={() => {
              onAddToCart(product, quantity);
              setAdding(true);
              setTimeout(() => setAdding(false), 800);
            }}
            className={`flex-1 text-white px-4 py-2 rounded-md font-medium flex items-center justify-center gap-2 shadow-md transition-colors ${
              adding ? "bg-green-600" : ""
            }`}
            style={!adding ? { backgroundColor: primaryColor } : {}}
          >
            {adding ? (
              <>✓ Added</>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" />
                Add
              </>
            )}
          </button>

          <button
            onClick={async () => {
              try {
                const res = await fetch("/api/shadow-orders", {
                  method:  "POST",
                  headers: { "Content-Type": "application/json" },
                  body:    JSON.stringify({ product_id: product.id, default_quantity: quantity }),
                });
                if (res.ok) {
                  alert("Added to your usual items!");
                  onFavoriteAdded?.();
                } else {
                  const err = await res.json();
                  alert(err.error || "Failed to add to favorites");
                }
              } catch (error) {
                console.error("Add to favorites error:", error);
              }
            }}
            className={`p-2 border-2 rounded-md transition ${
              isFavorite ? "bg-yellow-100 hover:bg-yellow-200" : "hover:bg-yellow-50"
            }`}
            style={{ borderColor: "#FFD700" }}
            title={isFavorite ? "Already in your usual items" : "Add to usual items"}
          >
            <Star
              className={`h-4 w-4 ${
                isFavorite ? "text-yellow-500 fill-current" : "text-gray-400"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}