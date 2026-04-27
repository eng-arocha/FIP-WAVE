import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Garante que os arquivos SQL de migration sejam incluídos no bundle do Vercel
  outputFileTracingIncludes: {
    '/': ['./supabase/migrations/**/*.sql'],
  },
  // sharp tem binários nativos por plataforma — precisa ficar fora do bundle
  // server pra carregar a build correta do Vercel (Linux x64).
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
