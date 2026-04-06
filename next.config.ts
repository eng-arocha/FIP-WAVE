import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Garante que os arquivos SQL de migration sejam incluídos no bundle do Vercel
  outputFileTracingIncludes: {
    '/': ['./supabase/migrations/**/*.sql'],
  },
};

export default nextConfig;
