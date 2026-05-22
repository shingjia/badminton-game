/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    // tsc is the build gate; eslint runs in IDE / npm run lint for dev feedback
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
