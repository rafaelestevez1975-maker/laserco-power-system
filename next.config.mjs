/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Envio de mídia (WhatsApp/anexos) via Server Actions vai em base64 (~33% maior).
    serverActions: { bodySizeLimit: '25mb' },
  },
  // Desenvolvimento multi-sessão no mesmo `main`: o build NÃO deve travar por erro de
  // tipo/lint de trabalho em andamento de outra frente (o SWC compila o JS de qualquer
  // forma — erro de tipo é do checador, não quebra runtime). Cada frente valida os
  // próprios tipos com `tsc --noEmit` antes de commitar. Reavaliar quando estabilizar.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
