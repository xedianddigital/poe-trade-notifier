/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Emits .next/standalone with a self-contained server and only the modules
  // actually reachable, which is what the Electron build ships.
  output: 'standalone',
}

export default nextConfig
