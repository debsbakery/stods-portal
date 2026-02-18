"use client"

export const dynamic = 'force-dynamic'
import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2" style={{ color: "#006A4E" }}>
            Customer Portal
          </h1>
          <p className="text-gray-600">Sign in to manage your account</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}