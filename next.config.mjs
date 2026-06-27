/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Envio de mídia (WhatsApp/anexos) via Server Actions vai em base64 (~33% maior).
    serverActions: { bodySizeLimit: '25mb' },
  },
  // Checagem de TIPOS no build mantida LIGADA (segurança): o build falha se houver erro
  // de tipo — verificado limpo com `tsc --noEmit`. Só o ESLint roda à parte (lint é ruidoso
  // e não deve bloquear o build da onda; rodar `next lint` separadamente).
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
