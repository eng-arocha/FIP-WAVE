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
| P0.5 | Curva-S: realizado real (físico via medições aprovadas + fat-direto via solicitações aprovadas) | ✅ | commit 1aa23dd |
| P0.4 | Trigger Postgres no teto `valor_material_direto` | ✅ | Migration 028. Serializa via FOR UPDATE |
| P0.2 | Validação Zod nos endpoints críticos | ✅ | 8 endpoints + helpers reusáveis em `lib/api/schema.ts` |
| P0.3 | Smoke tests + CI bloqueante | ✅ | Vitest + GH Actions (typecheck + 5 suites de teste em `tests/smoke.test.ts`) |
| P0.1 | Tenant isolation + RLS por workspace | ⏸️ | Aguardando decisão (segundo cliente / multi-empresa) |

## Fase 2 — Qualidade P1

| ID | Item | Status | Notas |
|----|------|--------|-------|
| P1.4 | Sentry ativo em prod | ✅ | SDK instalado + 3 configs (client/server/edge) + plugado em `lib/log.ts` e `segment-error.tsx`. Ativar definindo `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` no Vercel |
| P1.3 | `error.tsx` em cada segment do App Router | ✅ | 10 segments + global-error.tsx |
| P1.1 | Converter `/dashboard`, `/contratos`, listas para RSC | ⬜ | Não bloqueante — ajustar quando LCP virar problema |
| P1.2 | Paginação consistente (keyset) | ✅ | `lib/api/paginate.ts` (helper genérico) aplicado em `/api/contratos` (retrocompatível: opt-in via `?cursor=` ou `?limit=`) e `/api/aprovacoes` |
| P1.5 | Rate-limit em `/api/cnpj/[cnpj]` | ✅ | 20 req/min/IP via `lib/api/rate-limit.ts` (in-memory token bucket) |
| P1.6 | Validação MIME/magic-bytes no upload | ✅ | `lib/api/upload-validation.ts` aplicado em fat-direto/upload e nfs |
| P1.7 | Retry/DLQ em `notificacoes_log` | ✅ | Migration 034 + lib/email/send.ts refeito + cron `/api/cron/notificacoes-retry` |
| P1.8 | Snapshot do contrato ao aprovar aditivo | ✅ | Migration 033 (trigger automático em `aditivos`) |
| P1.9 | Audit log unificado | ✅ | Migration 029 + `lib/api/audit.ts` plugado em aprovar/rejeitar/desaprovar/glosa/comentário |
| P1.10 | MFA obrigatório pra admin/aprovador | ✅ | `lib/api/mfa.ts` + plugado em aprovar/rejeitar medição. Atrás da feature flag `MFA_ENFORCED=true` (precisa UI de cadastro TOTP antes de ligar) |

## Fase 3 — Produto P2 (diferenciação)

| ID | Item | Status | Notas |
|----|------|--------|-------|
| P2.1 | 3-way match NF × Pedido × CNPJ | ✅ | `NFMatchError` + `validarNotaFiscal3Way()` em `lib/db/fat-direto.ts` |
| P2.2 | Parse real XML NFe | ✅ | `lib/api/nfe-parser.ts` (parser nativo de XML v4.0 + fallback BrasilAPI por chave) + `POST /api/nfe/parse` |
| P2.3 | Boletim de Medição PDF assinado (hash SHA-256 + QR) | ✅ | Migration 036 + `/api/medicoes/[id]/emitir-boletim` + página pública `/verificar/[hash]` |
| P2.4 | Comentário por item de medição (fluxo prévio) | ✅ | Migration 031 + 3 endpoints REST + audit |
| P2.5 | Aprovação multinível real | ✅ | Migration 035 + `fluxo_aprovacao_contrato` + endpoints CRUD em `/api/contratos/[id]/fluxo-aprovacao` |
| P2.6 | Webhooks outbound | ✅ | Migration 037 + `lib/api/webhooks.ts` + cron retry + admin endpoint. Plugado em medicao/solicitacao aprovar/rejeitar/desaprovar |
| P2.7 | Export CSV/Excel em `/nf-fat-direto` | ✅ | `lib/utils/csv.ts` + botão na UI (12 colunas) |
| P2.8 | Retenções fiscais (ISS/INSS/IRRF/CSRF) | ✅ | Migration 032 + `lib/fiscal/retencoes.ts` (perfis material/serviço/locação) + endpoints `/retencoes` e `/sugerir-retencoes` |
| P2.9 | Alerta visual NF > 95% do pedido | ✅ | Endpoint `/saldo` + barra de progresso colorida + bloqueio quando esgotado |
| P2.10 | Validação cadastral CNPJ (situação RFB) | ✅ | `/api/cnpj/[cnpj]` já retorna `situacao_cadastral` + `ativa` |
| P2.11 | Reajuste contratual por índice (INCC/IPCA) | ✅ | Migration 035 + `contratos.coeficiente_reajuste_atual` + tabela `contratos_reajustes` + `POST /api/contratos/[id]/reajuste` |
| P2.12 | Gestão de garantias/retenção 5%/caução | ✅ | Migration 038 + endpoints CRUD (`/contratos/[id]/garantias`, `/garantias/[id]`). 4 tipos: caução/seguro/fiança/retenção. Resumo com vencendo em 30d |
| P2.13 | Glosa em medição | ✅ | Migration 030 + endpoint PUT + audit |
| P2.14 | EXIF check em upload de fotos | ✅ | `lib/api/exif.ts` (parser nativo de JPEG, sem deps) + `avaliarExif()` retorna warnings (sem EXIF, antiga, fora do raio, data futura) |
| P2.15 | Numeração `PEDIDO-FIP-XXXX` por sequence no servidor | ✅ | Migration 039: sequence atômica + trigger auto-assign quando NULL. Override manual ainda aceito. Endpoint `/proximo-numero` pra preview na UI |

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
