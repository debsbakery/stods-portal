"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { LogOut, ShoppingCart, User, Settings } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser({ email: user.email || "" });
        const { data: adminUser } = await supabase
          .from("admin_users")
          .select("id")
          .eq("user_id", user.id)
          .single();
        setIsAdmin(!!adminUser);
      }
    };
    getUser();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
      <div className="container flex h-16 items-center justify-between">
      {/* Logo */}
<Link href="/" className="flex items-center space-x-3">
  <img 
    src="/logo.svg"
    alt="Stods Bakery" 
    className="h-14 w-auto"
  />
  <div className="flex flex-col leading-none">
    <span className="font-bold text-xl" style={{ color: '#C4A882' }}>Deb's</span>
    <span className="font-semibold text-sm" style={{ color: '#3E1F00' }}>Bakery</span>
  </div>
</Link>
        {/* Navigation */}
        <nav className="hidden md:flex items-center space-x-6">
          <Link href="/catalog" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: '#000000' }}>
            Catalog
          </Link>
          <Link href="/order" className="text-sm font-medium hover:opacity-80 transition-opacity flex items-center" style={{ color: '#000000' }}>
            <ShoppingCart className="inline h-4 w-4 mr-1" />
            Order
          </Link>
        </nav>

        {/* User Menu */}
        <div className="flex items-center space-x-4">
          {user ? (
            <>
              <span className="text-sm text-gray-600 hidden sm:inline">
                <User className="inline h-4 w-4 mr-1" />
                {user.email}
              </span>
              {isAdmin && (
                <Link href="/admin">
                  <Button variant="outline" size="sm" className="border-2" style={{ borderColor: '#3E1F00', color: '#3E1F00' }}>
                    <Settings className="h-4 w-4 mr-1" />
                    Admin
                  </Button>
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-1" />
                Logout
              </Button>
            </>
          ) : (
            <Link href="/auth/login">
              <Button size="sm" className="text-white" style={{ backgroundColor: '#C4A882' }}>
                Login
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}