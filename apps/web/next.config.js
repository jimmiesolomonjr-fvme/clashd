/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@clashd/shared",
    "@clashd/supabase-client",
    "@clashd/agora-client",
    "@clashd/ui",
  ],
};

module.exports = nextConfig;
