import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const revision = process.env.GIT_SHA ?? crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Service worker dimatikan saat dev supaya HMR tidak tertahan cache
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: true,
  // Shell layar petugas dipasang saat install supaya app bisa dibuka di basement tanpa sinyal
  additionalPrecacheEntries: ["/", "/masuk", "/checkin", "/aktif", "/riwayat", "/akun", "/checkout/offline"].map((url) => ({
    url,
    revision,
  })),
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  output: "standalone",
  // Boleh diganti supaya dua `next dev` bisa jalan berdampingan
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@ceklis/design-tokens"],
  async rewrites() {
    // Satu origin untuk PWA + API supaya cookie sesi httpOnly berlaku (prod: reverse proxy yang sama)
    return [{ source: "/api/:path*", destination: `${process.env.API_INTERNAL_URL ?? "http://localhost:8000"}/api/:path*` }];
  },
};

export default withSerwist(nextConfig);
