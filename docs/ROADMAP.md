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
| P0.3 | 5 testes E2E golden-path + CI bloqueante | ⬜ | Próximo grande pendente — sem Playwright instalado ainda |
| P0.1 | Tenant isolation + RLS por workspace | ⏸️ | Aguardando decisão (segundo cliente / multi-empresa) |

## Fase 2 — Qualidade P1

| ID | Item | Status | Notas |
|----|------|--------|-------|
| P1.4 | Sentry ativo em prod | ⬜ | Hook preparado em `segment-error.tsx` e `lib/log.ts`; falta SDK + DSN |
| P1.3 | `error.tsx` em cada segment do App Router | ✅ | 10 segments + global-error.tsx |
| P1.1 | Converter `/dashboard`, `/contratos`, listas para RSC | ⬜ | Não bloqueante — ajustar quando LCP virar problema |
| P1.2 | Paginação consistente (keyset) | ⬜ | Não bloqueante — ajustar quando volume crescer |
| P1.5 | Rate-limit em `/api/cnpj/[cnpj]` | ✅ | 20 req/min/IP via `lib/api/rate-limit.ts` (in-memory token bucket) |
| P1.6 | Validação MIME/magic-bytes no upload | ✅ | `lib/api/upload-validation.ts` aplicado em fat-direto/upload e nfs |
| P1.7 | Retry/DLQ em `notificacoes_log` | ⬜ | Pendente — schema já tem `status_envio` |
| P1.8 | Snapshot do contrato ao aprovar aditivo | ⬜ | Pendente |
| P1.9 | Audit log unificado | ✅ | Migration 029 + `lib/api/audit.ts` plugado em aprovar/rejeitar/desaprovar/glosa/comentário |
| P1.10 | MFA obrigatório pra admin/aprovador | ⬜ | Pendente — Supabase suporta nativo |

## Fase 3 — Produto P2 (diferenciação)

| ID | Item | Status | Notas |
|----|------|--------|-------|
| P2.1 | 3-way match NF × Pedido × CNPJ | ✅ | `NFMatchError` + `validarNotaFiscal3Way()` em `lib/db/fat-direto.ts` |
| P2.2 | Parse real XML NFe | ⬜ | Pendente — escolher biblioteca (Nuvem Fiscal vs `node-nfe`) |
| P2.3 | Boletim de Medição PDF assinado (hash SHA-256 + QR) | ⬜ | Pendente — precisa de lib QR (`qrcode`) e endpoint `/verificar/[hash]` |
| P2.4 | Comentário por item de medição (fluxo prévio) | ✅ | Migration 031 + 3 endpoints REST + audit |
| P2.5 | Aprovação multinível real | ⬜ | Pendente — schema já suporta `aprovacoes.nivel` |
| P2.6 | Webhooks outbound | ⬜ | Pendente |
| P2.7 | Export CSV/Excel em `/nf-fat-direto` | ✅ | `lib/utils/csv.ts` + botão na UI (12 colunas) |
| P2.8 | Retenções fiscais (ISS/INSS/IRRF/CSRF) | ⬜ | Pendente |
| P2.9 | Alerta visual NF > 95% do pedido | ✅ | Endpoint `/saldo` + barra de progresso colorida + bloqueio quando esgotado |
| P2.10 | Validação cadastral CNPJ (situação RFB) | ✅ | `/api/cnpj/[cnpj]` já retorna `situacao_cadastral` + `ativa` |
| P2.11 | Reajuste contratual por índice (INCC/IPCA) | ⬜ | Pendente |
| P2.12 | Gestão de garantias/retenção 5%/caução | ⬜ | Pendente — necessário para obra pública |
| P2.13 | Glosa em medição | ✅ | Migration 030 + endpoint PUT + audit |
| P2.14 | EXIF check em upload de fotos | ⬜ | Pendente |
| P2.15 | Numeração `PEDIDO-FIP-XXXX` por sequence no servidor | ⏸️ | Aguarda decisão sobre fluxo (auto-gerar vs user-input) |

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
