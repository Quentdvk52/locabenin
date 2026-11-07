import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "z-cdn.chatglm.cn" },
      { protocol: "https", hostname: "sfile.chatglm.cn" },
    ],
    formats: ["image/webp"],
  },
  async headers() {
    // Anti-clickjacking : en production, X-Frame-Options: DENY s'applique tel quel.
    // Dans le bac à sable, le panneau d'aperçu de la plateforme affiche l'app dans
    // une iframe sur un domaine *.space-z.ai — on autorise l'encadrement uniquement
    // pour ces hôtes d'aperçu via CSP frame-ancestors (XFO reste interdit ailleurs).
    const isSandboxPreview = process.env.NEXT_PUBLIC_SANDBOX_PREVIEW === "1" || !!process.env.SANDBOX_PREVIEW_HOST;
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          isSandboxPreview
            ? { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://*.space-z.ai https://*.z.ai https://*.chatglm.cn" }
            : { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
          ...(process.env.NODE_ENV === "production" && !isSandboxPreview
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
      {
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
