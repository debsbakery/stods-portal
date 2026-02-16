"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Product, CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { ShoppingCart, Search, Loader2, Plus, Minus, ArrowLeft, Image as ImageIcon } from "lucide-react";

interface ProductWithPricing extends Product {
  customerPrice?: number;
  isContractPrice?: boolean;
}

export default function CatalogPage() {
  const router = useRouter();
  const supabase = createClient();

  const [products, setProducts] = useState<ProductWithPricing[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showOnlyShadowItems, setShowOnlyShadowItems] = useState(false);
  const [shadowProductIds, setShadowProductIds] = useState<Set<string>>(new Set());

  // ✅ Shadow loader — defined outside useEffect so ProductCard can call it too
  const loadShadowProductIds = async () => {
    try {
      const res = await fetch("/api/shadow-orders");
      const data = await res.json();

      if (Array.isArray(data)) {
        const ids = new Set<string>(
          data.map((item: any) => item.products?.id).filter(Boolean)
        );
        setShadowProductIds(ids);
      } else if (data.success && data.items) {
        const ids = new Set<string>(
          data.items.map((item: any) => item.product_id)
        );
        setShadowProductIds(ids);
      }
    } catch (error) {
      console.error("Error loading shadow products:", error);
    }
  };

  // ✅ Single useEffect — no duplicates
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("products")
          .select("*")
          .eq("is_available", true);

        if (fetchError) {
          setError(fetchError.message);
          setLoading(false);
          return;
        }

        if (!data || data.length === 0) {
          setProducts([]);
          setLoading(false);
          return;
        }

        // Fetch customer-specific pricing
        const productIds = data.map((p) => p.id);
        const pricingRes = await fetch("/api/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds }),
        });

        if (!pricingRes.ok) {
          setProducts(data);
          setLoading(false);
          return;
        }

        const pricingData = await pricingRes.json();

        const productsWithPricing = data.map((product) => ({
          ...product,
          customerPrice:
            pricingData.pricing[product.id]?.price ||
            parseFloat(product.price),
          isContractPrice:
            pricingData.pricing[product.id]?.isContractPrice || false,
          image_url: product.image_url || null,
        }));

        setProducts(productsWithPricing);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // Load saved cart from localStorage
    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error("Error loading cart:", e);
      }
    }

    fetchProducts();
    loadShadowProductIds();
  }, [supabase]);

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    localStorage.setItem("cart", JSON.stringify(newCart));
  };

  const handleAddToCart = (product: ProductWithPricing, quantity: number) => {
    const existingIndex = cart.findIndex(
      (item) => item.product.id === product.id
    );
    let newCart: CartItem[];

    const productForCart = {
      ...product,
      price: product.customerPrice || product.price,
    };

    if (existingIndex >= 0) {
      newCart = [...cart];
      newCart[existingIndex] = {
        product: productForCart as Product,
        quantity,
      };
    } else {
      newCart = [
        ...cart,
        { product: productForCart as Product, quantity },
      ];
    }
    saveCart(newCart);
  };

  const categories = [
    ...new Set(products.map((p) => p.category).filter(Boolean)),
  ];

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      !selectedCategory || product.category === selectedCategory;
    const matchesShadow =
      !showOnlyShadowItems || shadowProductIds.has(product.id);
    return matchesSearch && matchesCategory && matchesShadow;
  });

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-12 w-12 animate-spin" style={{ color: "#CE1126" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-2" style={{ color: "#CE1126" }}>
            Error Loading Products
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 text-white rounded-md"
            style={{ backgroundColor: "#CE1126" }}
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
        <button
          onClick={() => router.push("/")}
          className="flex items-center mb-4"
          style={{ color: "#CE1126" }}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </button>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Product Catalog</h1>
            {shadowProductIds.size > 0 && (
              <p className="text-gray-600">
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
                  showOnlyShadowItems
                    ? "bg-yellow-500 text-white"
                    : "bg-white text-gray-700 border-2"
                }`}
              >
                ⭐{" "}
                {showOnlyShadowItems
                  ? `Showing My Usual (${filteredProducts.length})`
                  : "Show My Usual"}
              </button>
            )}

            <button
              onClick={() => router.push("/order")}
              className="relative text-white px-6 py-3 rounded-md font-medium flex items-center gap-2 shadow-md"
              style={{ backgroundColor: "#CE1126" }}
            >
              <ShoppingCart className="h-5 w-5" />
              View Order
              {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-black text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search + Category Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-md font-medium ${
                !selectedCategory ? "text-white" : "bg-white text-gray-700 border"
              }`}
              style={!selectedCategory ? { backgroundColor: "#006A4E" } : {}}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat as string)}
                className={`px-4 py-2 rounded-md font-medium ${
                  selectedCategory === cat
                    ? "text-white"
                    : "bg-white text-gray-700 border"
                }`}
                style={selectedCategory === cat ? { backgroundColor: "#006A4E" } : {}}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-md">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-xl text-gray-600">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={handleAddToCart}
                currentQuantity={
                  cart.find((item) => item.product.id === product.id)
                    ?.quantity || 0
                }
                onFavoriteAdded={loadShadowProductIds}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ProductCard Component (WITH IMAGE SUPPORT)
// ═══════════════════════════════════════════
function ProductCard({
  product,
  onAddToCart,
  currentQuantity,
  onFavoriteAdded,
}: {
  product: ProductWithPricing;
  onAddToCart: (product: ProductWithPricing, quantity: number) => void;
  currentQuantity: number;
  onFavoriteAdded?: () => void;
}) {
  const [quantity, setQuantity] = useState(
    currentQuantity || product.min_quantity
  );
  const [imageError, setImageError] = useState(false);

  const handleQuantityChange = (value: number) => {
    const newQuantity = Math.max(
      product.min_quantity,
      Math.min(product.max_quantity, value)
    );
    setQuantity(newQuantity);
  };

  const displayPrice =
    product.customerPrice || parseFloat(product.price as any);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow">
      {/* Product Image */}
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
            style={{
              background: "linear-gradient(135deg, #FEE7E9 0%, #E6F5F0 100%)",
            }}
          >
            {imageError ? (
              <ImageIcon className="h-16 w-16 text-gray-300" />
            ) : (
              <span className="text-6xl">🍞</span>
            )}
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-lg">{product.name}</h3>
          {product.category && (
            <span
              className="text-xs px-2 py-1 rounded-full text-white"
              style={{ backgroundColor: "#006A4E" }}
            >
              {product.category}
            </span>
          )}
        </div>

        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {product.description}
        </p>

        <div className="flex justify-between items-center mb-3">
          <span
            className={`text-2xl font-bold ${
              product.isContractPrice ? "text-blue-600" : ""
            }`}
            style={!product.isContractPrice ? { color: "#CE1126" } : {}}
          >
            {formatCurrency(displayPrice)}
          </span>
          <span className="text-sm text-gray-500">per {product.unit}</span>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Min: {product.min_quantity} | Max: {product.max_quantity}
        </p>

        <div className="flex gap-2">
          <div
            className="flex items-center border-2 rounded-md"
            style={{ borderColor: "#006A4E" }}
          >
            <button
              onClick={() => handleQuantityChange(quantity - 1)}
              disabled={quantity <= product.min_quantity}
              className="p-2 hover:bg-gray-100 disabled:opacity-50"
            >
              <Minus className="h-4 w-4" style={{ color: "#006A4E" }} />
            </button>
            <input
              type="number"
              value={quantity}
              onChange={(e) =>
                handleQuantityChange(
                  parseInt(e.target.value) || product.min_quantity
                )
              }
              className="w-16 text-center border-0 focus:outline-none"
              min={product.min_quantity}
              max={product.max_quantity}
            />
            <button
              onClick={() => handleQuantityChange(quantity + 1)}
              disabled={quantity >= product.max_quantity}
              className="p-2 hover:bg-gray-100 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" style={{ color: "#006A4E" }} />
            </button>
          </div>

          <button
            onClick={() => onAddToCart(product, quantity)}
            className="flex-1 text-white px-4 py-2 rounded-md font-medium flex items-center justify-center gap-2 shadow-md"
            style={{ backgroundColor: "#CE1126" }}
          >
            <ShoppingCart className="h-4 w-4" />
            Add
          </button>

          <button
            onClick={async () => {
              try {
                const res = await fetch("/api/shadow-orders", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    product_id: product.id,
                    default_quantity: quantity,
                  }),
                });

                if (res.ok) {
                  alert("⭐ Added to your usual items!");
                  onFavoriteAdded?.();
                } else {
                  const error = await res.json();
                  alert(error.error || "Failed to add to favorites");
                }
              } catch (error) {
                console.error("Add to favorites error:", error);
                alert("Error adding to usual items");
              }
            }}
            className="p-2 border-2 rounded-md hover:bg-yellow-50 transition"
            style={{ borderColor: "#FFD700" }}
            title="Add to usual items"
          >
            ⭐
          </button>
        </div>
      </div>
    </div>
  );
}