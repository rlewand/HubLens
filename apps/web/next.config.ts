import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hublens/db", "@hublens/maturity-engine", "@hublens/acc-schema"],
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    proxyClientMaxBodySize: "2048mb",
  },
};

export default nextConfig;
