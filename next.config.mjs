/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Envio de mídia (WhatsApp/anexos) via Server Actions vai em base64 (~33% maior).
    serverActions: { bodySizeLimit: '25mb' },
  },
}

export default nextConfig
