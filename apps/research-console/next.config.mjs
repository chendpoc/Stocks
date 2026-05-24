/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["longbridge"],
  transpilePackages: ["@stock-summary/summary-core"],
};

export default nextConfig;
