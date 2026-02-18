export const dynamic = 'force-dynamic'


import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileText, ArrowLeft, Edit2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  price: number;
  gst_applicable: boolean;
}

interface Customer {
  id: string;
  email: string;
  business_name: string | null;
  contact_name: string | null;
  address: string | null;
  abn: string | null;
  payment_terms: number;
}

interface InvoiceItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  hasGST: boolean;
}

export default function DirectInvoicePage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerABN, setCustomerABN] = useState("");
  const [customerPaymentTerms, setCustomerPaymentTerms] = useState(30);
  const [allowEdit, setAllowEdit] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadProducts();
    loadCustomers();
  }, []);

  const loadProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("is_available", true)
      .order("name");
    
    setProducts(data || []);
  };

  const loadCustomers = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, email, business_name, contact_name, address, abn, payment_terms")
      .order("business_name");
    
    setCustomers(data || []);
  };

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setAllowEdit(false);
    
    if (customerId) {
      const customer = customers.find(c => c.id === customerId);
      if (customer) {
        setCustomerName(customer.business_name || customer.contact_name || "");
        setCustomerEmail(customer.email);
        setCustomerAddress(customer.address || "");
        setCustomerABN(customer.abn || "");
        setCustomerPaymentTerms(customer.payment_terms || 30);
      }
    } else {
      setCustomerName("");
      setCustomerEmail("");
      setCustomerAddress("");
      setCustomerABN("");
      setCustomerPaymentTerms(30);
    }
  };

  const addItem = () => {
    setItems([...items, { 
      productId: "", 
      productName: "", 
      quantity: 1, 
      unitPrice: 0, 
      hasGST: true 
    }]);
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    
    if (field === 'productId' && value) {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index] = {
          ...newItems[index],
          productId: product.id,
          productName: product.name,
          unitPrice: product.price,
          hasGST: product.gst_applicable !== false
        };
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const gst = items.reduce((sum, item) => 
      sum + (item.hasGST ? item.quantity * item.unitPrice * 0.1 : 0), 0
    );
    return { subtotal, gst, total: subtotal + gst };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    if (!customerEmail) {
      setError("Customer email is required");
      return;
    }

    if (items.length === 0) {
      setError("Please add at least one item");
      return;
    }

    const invalidItems = items.filter(item => !item.productId);
    if (invalidItems.length > 0) {
      setError("Please select a product for all items");
      return;
    }

    setLoading(true);

    try {
      const totals = calculateTotals();
      let customerId = selectedCustomerId;

      if (!customerId) {
        console.log("Checking for existing customer with email:", customerEmail);
        
        const { data: existingCustomer, error: checkError } = await supabase
          .from("customers")
          .select("id, email, business_name")
          .eq("email", customerEmail)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          console.error("Customer check error:", checkError);
          throw new Error(`Error checking customer: ${checkError.message}`);
        }

        if (existingCustomer) {
          console.log("Customer already exists:", existingCustomer.id);
          customerId = existingCustomer.id;
          
          if (customerName || customerAddress || customerABN) {
            console.log("Updating existing customer details");
            const { error: updateError } = await supabase
              .from("customers")
              .update({
                business_name: customerName || existingCustomer.business_name,
                contact_name: customerName || null,
                address: customerAddress || null,
                abn: customerABN || null,
                payment_terms: customerPaymentTerms,
              })
              .eq("id", customerId);

            if (updateError) {
              console.warn("Customer update warning:", updateError);
            }
          }
        } else {
          console.log("Creating new customer:", { customerEmail, customerName });
          
          const { data: newCustomer, error: customerError } = await supabase
            .from("customers")
            .insert({
              id: crypto.randomUUID(),
              email: customerEmail,
              business_name: customerName || null,
              contact_name: customerName || null,
              address: customerAddress || null,
              abn: customerABN || null,
              payment_terms: customerPaymentTerms,
              balance: 0,
            })
            .select()
            .single();

          if (customerError) {
            console.error("Customer creation error:", customerError);
            throw new Error(`Customer creation failed: ${customerError.message}`);
          }
          
          customerId = newCustomer.id;
          console.log("New customer created:", customerId);
        }
      } else if (allowEdit) {
        console.log("Updating existing customer:", customerId);
        
        const { error: updateError } = await supabase
          .from("customers")
          .update({
            business_name: customerName || null,
            contact_name: customerName || null,
            address: customerAddress || null,
            abn: customerABN || null,
            payment_terms: customerPaymentTerms,
          })
          .eq("id", customerId);

        if (updateError) {
          console.error("Customer update error:", updateError);
          throw new Error(`Customer update failed: ${updateError.message}`);
        }
      }

      console.log("Creating order for customer:", customerId);
      
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id: customerId,
          customer_email: customerEmail,
          customer_business_name: customerName || customerEmail,
          customer_address: customerAddress || null,
          customer_abn: customerABN || null,
          delivery_date: new Date().toISOString().split('T')[0],
          total_amount: totals.total,
          status: "delivered",
          source: "direct_invoice",
          notes: "Direct invoice - walk-in/phone order"
        })
        .select()
        .single();

      if (orderError) {
        console.error("Order creation error:", orderError);
        throw new Error(`Order creation failed: ${orderError.message}`);
      }

      console.log("Order created:", order.id);

      const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.quantity * item.unitPrice * (item.hasGST ? 1.1 : 1),
        gst_applicable: item.hasGST
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error("Order items error:", itemsError);
        throw new Error(`Order items creation failed: ${itemsError.message}`);
      }

      console.log("Order items created");

      console.log("Recording AR invoice...");
      
      const recordRes = await fetch("/api/ar/record-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id }),
      });

      const recordData = await recordRes.json();

      if (!recordData.success) {
        console.warn("AR recording failed:", recordData.error);
      } else {
        console.log("AR invoice recorded:", recordData.invoiceNumber);
        
        try {
          await fetch("/api/ar/aging/update", { method: "POST" });
          console.log("Aging updated automatically");
        } catch (agingErr) {
          console.warn("Aging auto-update failed:", agingErr);
        }
      }

      setSuccess(
        `✅ Invoice #${recordData.invoiceNumber || "N/A"} created! ` +
        `Total: ${formatCurrency(totals.total)}`
      );

      window.open(`/api/invoice/${order.id}`, "_blank");

      setTimeout(() => {
        setItems([]);
        setCustomerName("");
        setCustomerEmail("");
        setCustomerAddress("");
        setCustomerABN("");
        setSelectedCustomerId("");
        setAllowEdit(false);
        loadCustomers();
        setSuccess("");
      }, 3000);
      
    } catch (err: any) {
      console.error("Invoice creation error:", err);
      setError(err.message || err.toString() || "Unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <a
        href="/admin"
        className="flex items-center gap-1 text-sm mb-4 hover:opacity-80"
        style={{ color: "#CE1126" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin
      </a>

      <h1 className="text-3xl font-bold mb-2">Direct Invoice</h1>
      <p className="text-gray-600 mb-8">Create invoice for walk-in/phone customers</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Customer Details</h2>
            {selectedCustomerId && !allowEdit && (
              <button
                type="button"
                onClick={() => setAllowEdit(true)}
                className="flex items-center gap-1 text-sm px-3 py-1 border rounded-md hover:bg-gray-50"
                style={{ borderColor: "#006A4E", color: "#006A4E" }}
              >
                <Edit2 className="h-3 w-3" />
                Edit Details
              </button>
            )}
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Select Existing Customer</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => handleCustomerSelect(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">-- New Customer --</option>
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.business_name || customer.contact_name || customer.email}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Business / Contact Name {!selectedCustomerId && "*"}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={selectedCustomerId !== "" && !allowEdit}
                placeholder="Optional for existing customers"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
                required
                disabled={selectedCustomerId !== ""}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={selectedCustomerId !== "" && !allowEdit}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">ABN</label>
              <input
                type="text"
                value={customerABN}
                onChange={(e) => setCustomerABN(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={selectedCustomerId !== "" && !allowEdit}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Payment Terms (days)</label>
              <input
                type="number"
                value={customerPaymentTerms}
                onChange={(e) => setCustomerPaymentTerms(parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                min="0"
                disabled={selectedCustomerId !== "" && !allowEdit}
              />
            </div>
          </div>

          {!selectedCustomerId && (
            <p className="mt-3 text-xs text-blue-600">
              💡 New customer will be created automatically
            </p>
          )}
          
          {selectedCustomerId && allowEdit && (
            <p className="mt-3 text-xs text-orange-600">
              ⚠️ Customer details will be updated
            </p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Items</h2>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90"
              style={{ backgroundColor: '#006A4E' }}
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>

          {items.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No items added yet</p>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end border-b pb-3">
                  <div className="col-span-5">
                    <label className="block text-xs font-medium mb-1">Product *</label>
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(index, 'productId', e.target.value)}
                      className="w-full px-2 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      required
                    >
                      <option value="">Select product...</option>
                      {products.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name} - {formatCurrency(product.price)}
                          {product.gst_applicable ? " (incl. GST)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Qty</label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      min="1"
                      required
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.unitPrice}
                      className="w-full px-2 py-2 border rounded text-sm bg-gray-50"
                      readOnly
                    />
                  </div>
                  
                  <div className="col-span-2 text-right">
                    <label className="block text-xs font-medium mb-1">Total</label>
                    <p className="font-bold text-sm py-2">
                      {formatCurrency(item.quantity * item.unitPrice * (item.hasGST ? 1.1 : 1))}
                    </p>
                  </div>
                  
                  <div className="col-span-1">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                      title="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="space-y-2 max-w-sm ml-auto">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-bold">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-orange-600">
                <span>GST (10%):</span>
                <span className="font-bold">{formatCurrency(totals.gst)}</span>
              </div>
              <div className="flex justify-between text-xl pt-2 border-t-2" style={{ borderColor: '#CE1126' }}>
                <span className="font-bold">TOTAL:</span>
                <span className="font-bold" style={{ color: '#CE1126' }}>
                  {formatCurrency(totals.total)}
                </span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            ❌ {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.push('/admin')}
            className="px-6 py-3 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          
          <button
            type="submit"
            disabled={loading || items.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-white rounded-md hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#CE1126' }}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Generating Invoice...
              </>
            ) : (
              <>
                <FileText className="h-5 w-5" />
                Generate Invoice & Record AR
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}