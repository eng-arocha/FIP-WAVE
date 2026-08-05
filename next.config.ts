import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Garante que os arquivos SQL de migration sejam incluídos no bundle do Vercel
  outputFileTracingIncludes: {
    '/': ['./supabase/migrations/**/*.sql'],
  },
  // sharp tem binários nativos por plataforma — precisa ficar fora do bundle
  // server pra carregar a build correta do Vercel (Linux x64).
  //
  // pdf-parse é carregado por `require()` em runtime (o import estático dispara
  // um bug da lib, que tenta ler test/version1.3.pdf em tempo de build). Um
  // require dinâmico não é rastreável pelo bundler: sem declarar aqui, a lib
  // ficava de fora do deploy e /api/fat-direto/parse-pedido respondia 500
  // "Cannot find module" na Vercel — a leitura do PDF do pedido nunca funcionou
  // em produção, embora funcionasse em dev (node_modules presente).
  serverExternalPackages: ['sharp', 'pdf-parse'],
};

export default nextConfig;
