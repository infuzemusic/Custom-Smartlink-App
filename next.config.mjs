/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Emits a self-contained server bundle with only the traced dependencies, so the
  // runtime image does not need node_modules. Harmless on Vercel, which ignores it.
  output: 'standalone',
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};
export default nextConfig;
