# FIP-WAVE — Roadmap de Hardening & Evolução

> **Documento vivo.** Qualquer agente/dev que pegar o projeto DEVE atualizar esta lista ao concluir ou modificar itens. Mantenha status sincronizado. Ao compactar conversa, esta é a fonte da verdade.

**Branch de desenvolvimento:** `claude/improve-scrollbar-visibility-MI3PH`
**Deploy:** merge em `main` → Vercel `fip-wave.vercel.app`

---

## Legenda de status
- ⬜ `pending` — não iniciado
- 🟡 `in-progress` — em execução
- ✅ `done` — concluído e deployado
- ⏸️ `blocked` — aguardando decisão/recurso externo
- ❌ `dropped` — descartado (com justificativa)

---

## Fase 1 — Hardening P0 (bloqueantes antes de escalar)

| ID | Item | Status | Notas |
|----|------|--------|-------|
| P0.5 | Curva-S: desabilitar série "realizado" até integração real | ⬜ | TODO em `lib/db/planejamento.ts`. Risco de engano operacional |
| P0.4 | Trigger Postgres no teto `valor_material_direto` | ⬜ | Migration nova. Substitui check read-then-write |
| P0.2 | Validação Zod nos 10 endpoints críticos | ⬜ | `aprovar, rejeitar, desaprovar, criar medição, criar solicitação, upload, parse-pedido, registrar NF, alterar senha, editar permissões` |
| P0.3 | 5 testes E2E golden-path + CI bloqueante | ⬜ | Vitest + Playwright. GH Actions em PR→main |
| P0.1 | Tenant isolation + RLS por workspace | ⏸️ | Depende de decisão: há demanda multi-empresa agora? Se é só "outros tipos de contrato" (mesma empresa), P3 |

## Fase 2 — Qualidade P1

| ID | Item | Status | Notas |
|----|------|--------|-------|
| P1.4 | Sentry ativo em prod | ⬜ | SDK `@sentry/nextjs`. `lib/log.ts` já preparado |
| P1.3 | `error.tsx` em cada segment do App Router | ⬜ | dashboard, contratos, fat-direto, medicoes, aprovacoes, usuarios |
| P1.1 | Converter `/dashboard`, `/contratos`, listas para RSC | ⬜ | Server Actions pra mutações. Mantém client em gráficos |
| P1.2 | Paginação consistente (keyset) | ⬜ | Helper `paginate({cursor,limit})` |
| P1.5 | Rate-limit em `/api/cnpj/[cnpj]` | ⬜ | Upstash ou @vercel/kv |
| P1.6 | Validação MIME/magic-bytes no upload | ⬜ | Lib `file-type`. Bloqueia executável renomeado |
| P1.7 | Retry/DLQ em `notificacoes_log` | ⬜ | Cron 5min reprocessa `status_envio=pendente` |
| P1.8 | Snapshot do contrato ao aprovar aditivo | ⬜ | Tabela `contratos_historico` |
| P1.9 | Audit log unificado (ator/ação/recurso/before/after/IP) | ⬜ | Tabela `audit_log` + helper `audit()` |
| P1.10 | MFA obrigatório pra admin/aprovador | ⬜ | Supabase suporta TOTP. Enforcement no middleware |

## Fase 3 — Produto P2 (diferenciação)

| ID | Item | Status | Notas |
|----|------|--------|-------|
| P2.1 | 3-way match NF × Pedido × CNPJ | ⬜ | Bloqueia aprovação se divergir |
| P2.2 | Parse real XML NFe | ⬜ | BrasilAPI/Nuvem Fiscal ou `node-nfe`. Extrai emitente, itens, CFOP, chave |
| P2.3 | Boletim de Medição PDF assinado (hash SHA-256 + QR) | ⬜ | Verificação pública via `/verificar/[hash]` |
| P2.4 | Comentário por item de medição (fluxo prévio) | ⬜ | Thread em `medicao_itens` |
| P2.5 | Aprovação multinível real (eng. fiscal → coord → cliente) | ⬜ | UI lê `aprovacoes.nivel` |
| P2.6 | Webhooks outbound (`medicao.aprovada` etc.) | ⬜ | Tabela `webhook_subscriptions` + worker |
| P2.7 | Export CSV/Excel em `/nf-fat-direto` pra contabilidade | ⬜ | Inclui retenções, vencimentos |
| P2.8 | Retenções fiscais (ISS/INSS/IRRF/CSRF) | ⬜ | Campos em NF + cálculo |
| P2.9 | Alerta visual NF > 95% do pedido | ⬜ | UX simples, alto valor |
| P2.10 | Validação cadastral CNPJ (situação RFB) | ⬜ | Integra BrasilAPI ou similar |
| P2.11 | Reajuste contratual por índice (INCC/IPCA) | ⬜ | Campo `indice_reajuste` + aplicação por período |
| P2.12 | Gestão de garantias/retenção 5%/caução | ⬜ | Crítico se for atender obra pública |
| P2.13 | Glosa em medição (`valor_glosa` + `motivo_glosa`) | ⬜ | Em `medicao_itens` |
| P2.14 | EXIF check em upload de fotos (GPS/timestamp) | ⬜ | Anti-fraude em medição fotográfica |
| P2.15 | Numeração `PEDIDO-FIP-XXXX` por sequence no servidor | ⬜ | Substitui detecção por nome de arquivo |

## Fase 4 — Expansão P3

| ID | Item | Status | Notas |
|----|------|--------|-------|
| P3.1 | `contratos.modalidade` polimórfica (obra/serviço_continuado/fornecimento/locação/consultoria) | ⬜ | Interface Medidor polimórfica no frontend |
| P3.2 | Tenant isolation completo (workspace + RLS) | ⬜ | Quando houver 2º cliente |
| P3.3 | White-label (logo/cor/subdomínio por workspace) | ⬜ | Necessário pra B2B |
| P3.4 | Billing Stripe metered (nº contratos ativos) | ⬜ | Necessário pra SaaS |
| P3.5 | Integração SAP/TOTVS (export de NFs aprovadas) | ⬜ | Arquivo posicional ou REST |
| P3.6 | Integração DocuSign/Clicksign | ⬜ | Assinatura eletrônica contrato/medição |
| P3.7 | Dataset read-only pra BI (PostgREST ou export BigQuery) | ⬜ | Power BI/Looker |

---

## Melhorias oportunísticas encontradas durante a execução
(Adicione aqui tudo que virar no caminho e não estava previsto)

---

## Log de conclusões (ordem cronológica — mais recente no topo)
<!-- Formato: YYYY-MM-DD · ID · commit-hash · resumo em 1 linha -->
