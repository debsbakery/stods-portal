"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [supabase, setSupabase] = useState<any>(null);  // ✅ Changed
  
  const router = useRouter();

  // ✅ Initialize Supabase in useEffect
  useEffect(() => {
    setSupabase(createClient());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;  // ✅ Guard clause
    
    setLoading(true);
    setMessage(null);

    try {
      if (isSignUp) {
        // Sign up
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;
        
        setMessage({ 
          type: "success", 
          text: "Account created! You can now sign in." 
        });
        setIsSignUp(false);
        setPassword("");
      } else {
        // Sign in
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        
        router.push("/catalog");
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  // ✅ Show loading state while initializing
  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #FEE7E9 0%, #E6F5F0 100%)' }}>
        <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-8">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #FEE7E9 0%, #E6F5F0 100%)' }}>
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-8">
        {/* Logo and Header */}
        <div className="text-center mb-6">
          <img 
            src="/logo.svg"
            alt="stods bakeryBakery" 
            className="h-40 w-auto mx-auto mb-4"
          />
          <h2 className="text-2xl font-bold mb-1">
            <span style={{ color: '#C4A882' }}>Deb's</span>{" "}
            <span style={{ color: '#3E1F00' }}>Bakery</span>
          </h2>
          <p className="text-gray-600 mt-2">
            {isSignUp ? "Create your account" : "Welcome back"}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1" style={{ color: '#000000' }}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': '#C4A882' } as React.CSSProperties}
              required
            />
          </div>

          {/* Password Input */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1" style={{ color: '#000000' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': '#C4A882' } as React.CSSProperties}
              required
              minLength={6}
            />
            {isSignUp && (
              <p className="text-xs text-gray-500 mt-1">At least 6 characters</p>
            )}
          </div>

          {/* Message Display */}
          {message && (
            <div
              className={`p-3 rounded-md text-sm ${
                message.type === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full text-white py-2 px-4 rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-opacity"
            style={{ backgroundColor: '#C4A882' }}
          >
            {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>

          {/* Toggle Sign Up/Sign In */}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage(null);
              setPassword("");
            }}
            className="w-full text-sm font-medium hover:underline"
            style={{ color: '#3E1F00' }}
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up"}
          </button>
        </form>

        {/* Additional Info */}
        <div className="mt-6 pt-6 border-t text-center text-sm text-gray-500">
          <p>Wholesale orders only</p>
        </div>
      </div>
    </div>
  );
}