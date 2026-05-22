/** @type {import('next').NextConfig} */
const nextConfig = {
  // Note: cannot use output: 'standalone' with a custom server.js (Next.js docs).
  // We ship full node_modules + .next instead.
  eslint: {
    // tsc is the build gate; eslint runs in IDE / npm run lint for dev feedback
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
