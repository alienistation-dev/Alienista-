import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Every route is dynamic, and dynamic pages are not kept in the client cache by default,
    // so each tab switch waited on the server. Reuse a visited page for 30 s; server actions
    // that call revalidatePath still clear it immediately.
    staleTimes: { dynamic: 30 },
  },
  logging: {
    // Dev logs print every Server Action's arguments, including plaintext passwords.
    serverFunctions: false,
  },
};

export default nextConfig;
