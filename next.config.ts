import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: {
    // Disable ESLint during builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Skip TypeScript errors during build
    ignoreBuildErrors: true,
  },
}

export default nextConfig