/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        source: "/:file(favicon\\.ico|favicon-16x16\\.png|favicon-32x32\\.png|apple-touch-icon\\.png|icon-192\\.png|icon-512\\.png)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
