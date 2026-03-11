import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-red-50">
      <div className="text-center space-y-8 p-8">
        <div>
          <h1 className="text-6xl font-bold mb-2" style={{ color: "#3E1F00" }}>
            Stods Bakery
          </h1>
          <p className="text-xl text-gray-600">
            Wholesale Bread & Bakery Products
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
         <Link href="/catalog"
            className="px-8 py-4 rounded-lg text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow w-64"
            style={{ backgroundColor: "#3E1F00" }}
          >
            🛒 Browse Products
          </Link>
          <Link
            href="/portal"
            className="px-8 py-4 rounded-lg text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow w-64"
            style={{ backgroundColor: "#C4A882" }}
          >
            👤 Customer Portal
          </Link>
          <Link
            href="/login"
            className="px-8 py-4 rounded-lg border-2 font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow w-64"
            style={{ borderColor: "#3E1F00", color: "#3E1F00" }}
          >
            🔐 Admin Login
          </Link>
        </div>

        <div className="text-sm text-gray-500 mt-8">
          <p>Fresh daily deliveries • Online ordering • Flexible standing orders</p>
        </div>
      </div>
    </div>
  );
}