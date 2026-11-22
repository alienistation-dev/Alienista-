import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  logging: {
    // Dev logs print every Server Action's arguments, including plaintext passwords.
    serverFunctions: false,
  },
};

export default nextConfig;
