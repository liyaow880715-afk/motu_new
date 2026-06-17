/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  outputFileTracingExcludes: {
    "*": ["banana-mall-main/**/*"],
  },
};

export default nextConfig;
