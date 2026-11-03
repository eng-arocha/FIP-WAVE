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
1. [x] Upgrade para Pro (Alex, 03/11/2026).
2. [x] Backup completo em `C:\dev\FIP-WAVE-storage-backup` (658 arquivos, 1,48 GB).
3. [x] `--apply` em 03/11/2026: 87 órfãos apagados (150 MB), 249 PDFs
       1.301 MB → 108 MB, sem falhas. **Bucket: 1.482 MB → 138 MB.**
       Amostra conferida: DANFE de 15,8 MB → 0,6 MB, totalmente legível.
4. [x] Login voltou e NFs conferidas pelo app, legíveis (Alex, 03/11/2026).
5. [ ] Downgrade para Free perto da data de renovação do Pro (o mês já está pago).

Para rodar o script de novo: `ENV_FILE=<.env do vercel env pull> npx vite-node scripts/storage-cleanup.ts`.
6. [ ] Apagar a org vazia "Mourao Rocha 2", criada na tentativa de transferência.

## Dívidas conhecidas
- **Troca de arquivo de NF (PATCH `nfs/[nfId]`)**: não compacta o arquivo novo
  e deixa o antigo órfão. É rara. Quando incomodar, reaproveite
  `compactarNoLugar` da rota de POST. O script de limpeza recolhe os órfãos.
- **Duplicados** (mesmo arquivo, paths diferentes, ~135 MB antes da compressão)
  não são deduplicados; depois da compressão o peso fica pequeno.
- Rodar o script de limpeza de vez em quando, ou ao chegar perto de 800 MB.
