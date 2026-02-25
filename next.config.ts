/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Skip ESLint during build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ⚠️ Skip TypeScript errors during build
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig