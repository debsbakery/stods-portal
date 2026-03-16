"use client"

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
const handleForgotPassword = async () => {
  if (!email) {
    setError('Please enter your email address first')
    return
  }
  setIsLoading(true)
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/callback?next=/portal/set-password`,
  })
  if (error) {
    setError(error.message)
  } else {
    setError('')
    alert(`Password reset email sent to ${email} — check your inbox!`)
  }
  setIsLoading(false)
}
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 🔐 Step 1: Sign in with email/password
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
        return;
      }

      // 🔍 Step 2: Get user metadata (role)
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setError('Failed to fetch user data');
        setIsLoading(false);
        return;
      }

      // 📊 Step 3: Check role and redirect accordingly
      const userRole = user.user_metadata?.role;

      console.log('🔍 Login - User:', user.email);
      console.log('🔍 Login - Role:', userRole);

      if (userRole === 'admin') {
        console.log('✅ Redirecting to /admin');
        router.push('/admin');
        router.refresh(); // Force route refresh
      } else {
        console.log('✅ Redirecting to /portal');
        router.push('/portal');
        router.refresh();
      }

    } catch (err: any) {
      console.error('❌ Login error:', err);
      setError(err.message || 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
{/* Forgot Password */}
<div className="text-center">
  <button
    type="button"
    onClick={handleForgotPassword}
    className="text-sm text-green-700 hover:underline"
  >
    Forgot password or first time logging in?
  </button>
</div>
        {/* Email Field */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-600 focus:border-transparent"
            placeholder="you@company.com"
            disabled={isLoading}
          />
        </div>

        {/* Password Field */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-600 focus:border-transparent"
            placeholder="••••••••"
            disabled={isLoading}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: isLoading ? '#9CA3AF' : '#006A4E' }}
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      {/* Helper Text */}
      <p className="mt-4 text-center text-sm text-gray-600">
        Don't have an account? Contact your administrator.
      </p>
    </div>
  );
}