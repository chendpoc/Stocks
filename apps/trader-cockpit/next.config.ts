import type { NextConfig } from "next";

const agentApiProxyTarget =
  process.env.AGENT_API_PROXY_TARGET ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/agent/:path*",
        destination: `${agentApiProxyTarget}/api/agent/:path*`,
      },
    ];
  },
};

export default nextConfig;
