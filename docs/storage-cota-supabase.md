# Cota de Storage do Supabase — incidente de 31/10/2026

## O que aconteceu
A org "Mourao Rocha Engenharia" (plano Free) passou de 1 GB de storage
(1,55 GB no total; o FIP_WAVE sozinho tinha 1,48 GB). O Supabase restringiu
a org: login e storage passaram a responder **HTTP 402** para todos os
usuários. O banco continuou acessível pelo painel.

Causa: NFs escaneadas no bucket `faturamento-direto/nfs-fat-direto/`, com 4 a
18 MB cada. Elas entravam por signed URL e não passavam pelo `optimizeUpload`,
que de qualquer forma não recomprimia as imagens dentro do PDF.
Havia também 87 arquivos órfãos (~150 MB).

Tentativas que **não** funcionam enquanto a org está restrita:
- transferir o projeto para outra org Free (o painel recusa);
- baixar ou apagar arquivos pela API ou pelo painel (402 / não carrega).

## Decisão
Pagar o Pro por **um mês**, limpar e voltar para o Free.

## Próximos passos
1. [ ] Upgrade para Pro (Alex, pelo painel de billing).
2. [ ] `npx vite-node scripts/storage-cleanup.ts` → backup + estimativa.
3. [ ] `npx vite-node scripts/storage-cleanup.ts --apply` → apaga órfãos e recomprime.
4. [ ] Conferir algumas NFs abrindo pelo app (legibilidade).
5. [ ] Downgrade para Free quando o bucket estiver abaixo de ~400 MB.
6. [ ] Apagar a org vazia "Mourao Rocha 2", criada na tentativa de transferência.

## Dívidas conhecidas
- **Troca de arquivo de NF (PATCH `nfs/[nfId]`)**: não compacta o arquivo novo
  e deixa o antigo órfão. É rara. Quando incomodar, reaproveite
  `compactarNoLugar` da rota de POST. O script de limpeza recolhe os órfãos.
- **Duplicados** (mesmo arquivo, paths diferentes, ~135 MB antes da compressão)
  não são deduplicados; depois da compressão o peso fica pequeno.
- Rodar o script de limpeza de vez em quando, ou ao chegar perto de 800 MB.
