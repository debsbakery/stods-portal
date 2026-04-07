export default function CostingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      <nav className="flex gap-2 flex-wrap border-b border-gray-200 pb-3">
        <a href="/admin/costings" className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100">
          All Products
        </a>
        <a href="/admin/costings/settings" className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100">
          Cost Settings
        </a>
        <a href="/admin/costings/ingredients" className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100">
          Ingredients
        </a>
        <a href="/admin/costings/recipes" className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100">
          Recipes
        </a>
        <a href="/admin/costings/suppliers" className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100">
          🚚 Suppliers
        </a>
        <a href="/admin/costings/price-compare" className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100">
          🏷️ Price Compare
        </a>
        <a href="/admin/costings/stock" className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100">
          📦 Stock
        </a>
      </nav>
      {children}
    </div>
  )
}