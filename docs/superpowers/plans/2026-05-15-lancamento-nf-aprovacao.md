# Lançamento de NF pela contratada com aprovação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a contratada lance notas fiscais contra pedidos de faturamento direto aprovados, e que o contratante apenas aprove/rejeite o lançamento.

**Architecture:** Workflow de status na própria tabela `notas_fiscais_fat_direto` (Abordagem A do spec). A contratada lança → NF nasce `aguardando_aprovacao` → contratante aprova (`aprovada`) ou rejeita com motivo (`em_correcao`) → contratada corrige e reenvia. Reaproveita o 3-way match (`validarNotaFiscal3Way`), o upload via signed URL e a lógica de saldo já existentes. NF pendente reserva saldo; só `aprovada` conta como pagável.

**Tech Stack:** Next.js (App Router, versão não-padrão — ler `node_modules/next/dist/docs/` antes de mexer), Supabase (Postgres + Storage), TypeScript, Vitest (testes unitários puros, node env), Brevo (e-mail via `lib/email/send.ts`).

**Spec:** `docs/superpowers/specs/2026-05-15-lancamento-nf-aprovacao-design.md`

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/065_nf_workflow_aprovacao.sql` | **Criar** — colunas novas, migração de status legados, novo CHECK, grant de permissão |
| `lib/db/nf-workflow.ts` | **Criar** — máquina de estados pura (status inicial, transições, predicado de saldo) + funções de transição (`aprovarNotaFiscal`, `rejeitarNotaFiscal`) |
| `lib/db/nf-workflow.test.ts` | **Criar** — testes unitários das funções puras |
| `lib/db/fat-direto.ts` | **Modificar** — `validarNotaFiscal3Way` usa o predicado de saldo; `criarNotaFiscal` aceita `lancado_por_id` + `status` inicial |
| `lib/email/templates-nf-workflow.ts` | **Criar** — 3 templates de e-mail (aguardando aprovação, aprovada, em correção) |
| `app/api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs/route.ts` | **Modificar** — POST gateado por `nf_fat_direto:lancar`, define status inicial, envia e-mail |
| `app/api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs/[nfId]/aprovar/route.ts` | **Criar** — POST aprovar/rejeitar, gateado por `nf_fat_direto:aprovar` |
| `app/api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs/[nfId]/route.ts` | **Criar** — PATCH reenvio após correção, gateado por `nf_fat_direto:lancar` |
| `app/(app)/contratos/[id]/fat-direto/[solId]/page.tsx` | **Modificar** — badge de status nas NFs, tela de correção para `em_correcao` |
| `app/(app)/nf-fat-direto/page.tsx` | **Modificar** — fila "Aguardando aprovação" + ações aprovar/rejeitar |
| Agregações de NF (Task 9) | **Modificar** — somatórios de "pagável" passam a filtrar `status='aprovada'` |

---

## Task 1: Migration 065 — schema do workflow

**Files:**
- Create: `supabase/migrations/065_nf_workflow_aprovacao.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Migration 065: Workflow de aprovação de NF de faturamento direto
-- ----------------------------------------------------------------------
-- A contratada lança a NF; o contratante aprova/rejeita o lançamento.
-- Estados: aguardando_aprovacao -> aprovada | em_correcao (-> reenvio).
-- Idempotente: pode rodar várias vezes.

-- 1) Colunas novas
ALTER TABLE notas_fiscais_fat_direto
  ADD COLUMN IF NOT EXISTS lancado_por_id  UUID REFERENCES perfis(id),
  ADD COLUMN IF NOT EXISTS lancado_em      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT;

COMMENT ON COLUMN notas_fiscais_fat_direto.lancado_por_id IS
  'Perfil que lançou a NF (contratada). NULL para NFs legadas.';
COMMENT ON COLUMN notas_fiscais_fat_direto.lancado_em IS
  'Quando a NF foi lançada.';
COMMENT ON COLUMN notas_fiscais_fat_direto.motivo_rejeicao IS
  'Motivo da última rejeição (sobrescrito a cada ciclo; histórico fica no audit_log).';

-- 2) Migra dados existentes ANTES de apertar o CHECK
--    pendente/validada -> aprovada (lançadas pelo contratante, confiáveis)
--    rejeitada -> cancelada (no novo modelo a rejeição é a volta em_correcao)
ALTER TABLE notas_fiscais_fat_direto DROP CONSTRAINT IF EXISTS notas_fiscais_fat_direto_status_check;

UPDATE notas_fiscais_fat_direto SET status = 'aprovada'  WHERE status IN ('pendente', 'validada');
UPDATE notas_fiscais_fat_direto SET status = 'cancelada' WHERE status = 'rejeitada';

-- 3) Novo CHECK — só os 4 estados do workflow
ALTER TABLE notas_fiscais_fat_direto
  ADD CONSTRAINT notas_fiscais_fat_direto_status_check
  CHECK (status IN ('aguardando_aprovacao', 'aprovada', 'em_correcao', 'cancelada'));

-- 4) Default seguro pra novos inserts que não definirem status
ALTER TABLE notas_fiscais_fat_direto ALTER COLUMN status SET DEFAULT 'aguardando_aprovacao';

-- 5) Índice pra fila de aprovação
CREATE INDEX IF NOT EXISTS idx_nf_fatd_status ON notas_fiscais_fat_direto(status);

-- 6) Permissão: a contratada (template "Engenheiro FIP") pode lançar NF.
--    A aprovação fica com admin (admin já tem bypass total de permissões).
UPDATE templates_permissao
   SET permissoes = permissoes || '[{"modulo":"nf_fat_direto","acao":"lancar"}]'::jsonb
 WHERE nome = 'Engenheiro FIP'
   AND NOT (permissoes @> '[{"modulo":"nf_fat_direto","acao":"lancar"}]'::jsonb);
```

- [ ] **Step 2: Commit + push (Regra 1 e 2 do projeto) e colar o SQL no chat**

```bash
git add supabase/migrations/065_nf_workflow_aprovacao.sql
git commit -m "feat(065): migration workflow de aprovacao de NF fat-direto"
git push origin claude/relaxed-ishizaka-32ad00
```

Após o push, **colar o conteúdo completo do `.sql` no chat** em bloco de código para o usuário rodar no Supabase SQL Editor (Regra 1 do projeto). Aguardar confirmação de que rodou antes das tasks que dependem das colunas novas — o código das tasks seguintes é resiliente à ausência (segue o padrão `isSchemaMissingError` de `criarNotaFiscal`), mas o teste de ponta-a-ponta exige a migration aplicada.

---

## Task 2: Máquina de estados pura — `lib/db/nf-workflow.ts`

**Files:**
- Create: `lib/db/nf-workflow.ts`
- Test: `lib/db/nf-workflow.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// lib/db/nf-workflow.test.ts
import { describe, it, expect } from 'vitest'
import {
  statusInicialNf,
  podeTransicionar,
  nfReservaSaldo,
  type NfStatus,
} from './nf-workflow'

describe('statusInicialNf', () => {
  it('lançador SEM permissão de aprovar → aguardando_aprovacao', () => {
    expect(statusInicialNf(false)).toBe('aguardando_aprovacao')
  })
  it('lançador COM permissão de aprovar → aprovada (auto-aprovação)', () => {
    expect(statusInicialNf(true)).toBe('aprovada')
  })
})

describe('podeTransicionar', () => {
  it('aguardando_aprovacao → aprovada é válido', () => {
    expect(podeTransicionar('aguardando_aprovacao', 'aprovada')).toBe(true)
  })
  it('aguardando_aprovacao → em_correcao é válido', () => {
    expect(podeTransicionar('aguardando_aprovacao', 'em_correcao')).toBe(true)
  })
  it('em_correcao → aguardando_aprovacao é válido (reenvio)', () => {
    expect(podeTransicionar('em_correcao', 'aguardando_aprovacao')).toBe(true)
  })
  it('aprovada → em_correcao é inválido', () => {
    expect(podeTransicionar('aprovada', 'em_correcao')).toBe(false)
  })
  it('cancelada não transiciona pra lugar nenhum', () => {
    expect(podeTransicionar('cancelada', 'aprovada')).toBe(false)
  })
})

describe('nfReservaSaldo', () => {
  it('aguardando_aprovacao reserva saldo', () => {
    expect(nfReservaSaldo('aguardando_aprovacao')).toBe(true)
  })
  it('em_correcao reserva saldo', () => {
    expect(nfReservaSaldo('em_correcao')).toBe(true)
  })
  it('aprovada reserva saldo', () => {
    expect(nfReservaSaldo('aprovada')).toBe(true)
  })
  it('cancelada NÃO reserva saldo', () => {
    expect(nfReservaSaldo('cancelada')).toBe(false)
  })
  it('rejeitada legada NÃO reserva saldo', () => {
    expect(nfReservaSaldo('rejeitada')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/db/nf-workflow.test.ts`
Expected: FAIL — `Cannot find module './nf-workflow'`.

- [ ] **Step 3: Implementar as funções puras**

```typescript
// lib/db/nf-workflow.ts
/**
 * Máquina de estados do workflow de aprovação de NF de faturamento direto.
 *
 * Estados:
 *  - aguardando_aprovacao: contratada lançou; aguardando o contratante.
 *  - aprovada: contratante aprovou. Só aqui a NF "vale" (pagável/relatórios).
 *  - em_correcao: contratante rejeitou com motivo; volta pra contratada.
 *  - cancelada: NF abandonada (não conta pra saldo).
 */
export type NfStatus = 'aguardando_aprovacao' | 'aprovada' | 'em_correcao' | 'cancelada'

/**
 * Status inicial da NF no lançamento. Quem tem permissão de aprovar
 * (admin / representante do contratante) lança direto como aprovada —
 * não faz sentido aprovar a si mesmo.
 */
export function statusInicialNf(lancadorPodeAprovar: boolean): NfStatus {
  return lancadorPodeAprovar ? 'aprovada' : 'aguardando_aprovacao'
}

/** Transições permitidas do workflow. */
const TRANSICOES: Record<NfStatus, NfStatus[]> = {
  aguardando_aprovacao: ['aprovada', 'em_correcao', 'cancelada'],
  em_correcao: ['aguardando_aprovacao', 'cancelada'],
  aprovada: ['cancelada'],
  cancelada: [],
}

/** True se a transição `de → para` é válida. */
export function podeTransicionar(de: NfStatus, para: NfStatus): boolean {
  return TRANSICOES[de]?.includes(para) ?? false
}

/**
 * True se uma NF nesse status consome (reserva) saldo do pedido — ou seja,
 * entra no somatório do 3-way match. Só `cancelada` (e o legado `rejeitada`)
 * não reservam.
 */
export function nfReservaSaldo(status: string): boolean {
  return status === 'aguardando_aprovacao' || status === 'em_correcao' || status === 'aprovada'
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/db/nf-workflow.test.ts`
Expected: PASS — 12 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add lib/db/nf-workflow.ts lib/db/nf-workflow.test.ts
git commit -m "feat(nf-workflow): maquina de estados pura do workflow de NF"
```

---

## Task 3: 3-way match conta NFs pendentes — `lib/db/fat-direto.ts`

A reserva de saldo só é correta se o 3-way match contar as NFs `aguardando_aprovacao` e `em_correcao`, não só as `aprovada`. Hoje o filtro é `n.status !== 'rejeitada'` — funcionava porque `rejeitada` era o único estado "morto". Com os estados novos, `cancelada` também precisa ser excluída.

**Files:**
- Modify: `lib/db/fat-direto.ts` (função `validarNotaFiscal3Way`, ~linha 726)

- [ ] **Step 1: Importar o predicado**

No topo de `lib/db/fat-direto.ts`, adicionar ao bloco de imports:

```typescript
import { nfReservaSaldo } from '@/lib/db/nf-workflow'
```

- [ ] **Step 2: Trocar o filtro de NFs ativas**

Localizar em `validarNotaFiscal3Way`:

```typescript
  const ativas = (nfsAtivas || []).filter((n: any) => n.status !== 'rejeitada')
```

Substituir por:

```typescript
  // NF "ativa" = reserva saldo do pedido (aguardando_aprovacao, em_correcao,
  // aprovada). cancelada/rejeitada-legada não contam. Inclui as pendentes
  // pra que a contratada não lance duas NFs que estouram o mesmo pedido.
  const ativas = (nfsAtivas || []).filter((n: any) => nfReservaSaldo(n.status))
```

- [ ] **Step 3: Verificar o build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep fat-direto || echo "sem erros em fat-direto.ts"`
Expected: `sem erros em fat-direto.ts` (erros pré-existentes em outros arquivos são aceitáveis).

- [ ] **Step 4: Commit**

```bash
git add lib/db/fat-direto.ts
git commit -m "feat(3way): NF pendente reserva saldo no match"
```

---

## Task 4: `criarNotaFiscal` aceita status inicial e lançador

**Files:**
- Modify: `lib/db/fat-direto.ts` (função `criarNotaFiscal`, ~linha 812)

- [ ] **Step 1: Adicionar os parâmetros à assinatura**

No objeto `input:` de `criarNotaFiscal`, adicionar ao final dos campos:

```typescript
  /** Perfil que lançou a NF (contratada ou contratante). */
  lancado_por_id?: string
  /** True se o lançador tem permissão de aprovar → NF nasce aprovada. */
  lancador_pode_aprovar?: boolean
```

- [ ] **Step 2: Definir status + metadados de lançamento no insert**

Logo após a linha `const { override_data_anterior, override_excede_saldo, motivo_divergencia, ...rest } = input`, adicionar o import no topo do arquivo se ainda não houver:

```typescript
import { statusInicialNf } from '@/lib/db/nf-workflow'
```

E remover também `lancado_por_id` e `lancador_pode_aprovar` do `rest` (não são colunas diretas da forma como vêm). Trocar a desestruturação por:

```typescript
  const {
    override_data_anterior, override_excede_saldo, motivo_divergencia,
    lancado_por_id, lancador_pode_aprovar, ...rest
  } = input

  const statusInicial = statusInicialNf(!!lancador_pode_aprovar)
  const agora = new Date().toISOString()
```

- [ ] **Step 3: Incluir os campos no payload do insert**

No objeto `insertPayloadComFlags`, adicionar:

```typescript
    status: statusInicial,
    lancado_por_id: lancado_por_id ?? null,
    lancado_em: agora,
    // Auto-aprovação: se nasce aprovada, registra o aprovador = lançador
    validado_por_id: statusInicial === 'aprovada' ? (lancado_por_id ?? null) : null,
    validado_em: statusInicial === 'aprovada' ? agora : null,
```

E ao array de colunas do fallback `isSchemaMissingError` (que hoje lista `divergencia_valor` etc.), adicionar `'lancado_por_id'`, `'lancado_em'` para que o fallback resiliente funcione se a migration 065 ainda não rodou. No fallback `r2` (insert só com `rest`), incluir explicitamente `status: statusInicial` no objeto.

- [ ] **Step 4: Verificar o build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep fat-direto || echo "ok"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/fat-direto.ts
git commit -m "feat(nf): criarNotaFiscal define status inicial e lancador"
```

---

## Task 5: Funções de transição — aprovar / rejeitar

**Files:**
- Modify: `lib/db/nf-workflow.ts` (adicionar funções com efeito de DB)

- [ ] **Step 1: Adicionar `aprovarNotaFiscal` e `rejeitarNotaFiscal`**

Adicionar ao fim de `lib/db/nf-workflow.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { validarNotaFiscal3Way, NFMatchError } from '@/lib/db/fat-direto'
import { audit } from '@/lib/api/audit'

interface AtorAudit { actor_id: string; actor_email?: string | null }

/**
 * Aprova o lançamento de uma NF. Revalida o 3-way match no momento da
 * aprovação — o saldo pode ter mudado desde o lançamento (outra NF
 * aprovada no intervalo). Se a NF agora estoura o saldo, lança
 * NFMatchError e o handler deve avisar o aprovador.
 */
export async function aprovarNotaFiscal(nfId: string, ator: AtorAudit): Promise<void> {
  const admin = createAdminClient()
  const { data: nf, error } = await admin
    .from('notas_fiscais_fat_direto')
    .select('id, solicitacao_id, numero_nf, cnpj_emitente, valor, data_emissao, status')
    .eq('id', nfId)
    .single()
  if (error || !nf) throw new NFMatchError('SOLICITACAO_NAO_APROVADA', 'NF não encontrada.', {})
  if (!podeTransicionar(nf.status as NfStatus, 'aprovada')) {
    throw new NFMatchError('SOLICITACAO_NAO_APROVADA',
      `NF no status "${nf.status}" não pode ser aprovada.`, { status: nf.status })
  }

  // Revalida o match ignorando a própria NF no somatório de saldo:
  // validarNotaFiscal3Way soma todas as ativas; como esta NF já está
  // gravada (ativa), passamos valor 0 e checamos o saldo restante.
  await validarNotaFiscal3Way({
    solicitacao_id: nf.solicitacao_id,
    numero_nf: nf.numero_nf,
    cnpj_emitente: nf.cnpj_emitente ?? undefined,
    valor: 0,
    data_emissao: nf.data_emissao,
    override_data_anterior: true, // data já foi validada no lançamento
  })

  const agora = new Date().toISOString()
  const { error: upErr } = await admin
    .from('notas_fiscais_fat_direto')
    .update({ status: 'aprovada', validado_por_id: ator.actor_id, validado_em: agora, motivo_rejeicao: null })
    .eq('id', nfId)
  if (upErr) throw upErr

  await audit({
    event: 'nf.aprovada', entity_type: 'nota_fiscal_fat_direto', entity_id: nfId,
    actor_id: ator.actor_id, actor_email: ator.actor_email ?? null,
    metadata: { numero_nf: nf.numero_nf, solicitacao_id: nf.solicitacao_id },
  })
}

/**
 * Rejeita o lançamento de uma NF — volta pra contratada corrigir.
 * Exige motivo.
 */
export async function rejeitarNotaFiscal(
  nfId: string, motivo: string, ator: AtorAudit,
): Promise<void> {
  const motivoLimpo = (motivo ?? '').trim()
  if (!motivoLimpo) throw new Error('Motivo da rejeição é obrigatório.')

  const admin = createAdminClient()
  const { data: nf, error } = await admin
    .from('notas_fiscais_fat_direto')
    .select('id, solicitacao_id, numero_nf, status')
    .eq('id', nfId)
    .single()
  if (error || !nf) throw new Error('NF não encontrada.')
  if (!podeTransicionar(nf.status as NfStatus, 'em_correcao')) {
    throw new Error(`NF no status "${nf.status}" não pode ser rejeitada.`)
  }

  const { error: upErr } = await admin
    .from('notas_fiscais_fat_direto')
    .update({ status: 'em_correcao', motivo_rejeicao: motivoLimpo })
    .eq('id', nfId)
  if (upErr) throw upErr

  await audit({
    event: 'nf.rejeitada', entity_type: 'nota_fiscal_fat_direto', entity_id: nfId,
    actor_id: ator.actor_id, actor_email: ator.actor_email ?? null,
    metadata: { numero_nf: nf.numero_nf, solicitacao_id: nf.solicitacao_id, motivo: motivoLimpo },
  })
}
```

- [ ] **Step 2: Verificar o build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep nf-workflow || echo "ok"`
Expected: `ok`.

- [ ] **Step 3: Confirmar que os testes puros continuam passando**

Run: `npx vitest run lib/db/nf-workflow.test.ts`
Expected: PASS — 12 testes (as funções novas tocam DB, não são cobertas por unit test; serão verificadas ponta-a-ponta na Task 8).

- [ ] **Step 4: Commit**

```bash
git add lib/db/nf-workflow.ts
git commit -m "feat(nf-workflow): aprovar/rejeitar com revalidacao do match"
```

---

## Task 6: Templates de e-mail — `lib/email/templates-nf-workflow.ts`

**Files:**
- Create: `lib/email/templates-nf-workflow.ts`

- [ ] **Step 1: Criar os 3 templates**

Seguir o padrão de `lib/email/templates-fat-direto.ts` (função que recebe payload e retorna `{ subject, html }`; usar `escapeHtml` para todo dado dinâmico).

```typescript
// lib/email/templates-nf-workflow.ts
function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function layout(titulo: string, corpo: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${escapeHtml(titulo)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:18px;">${escapeHtml(titulo)}</h2>
    ${corpo}
    <p style="margin-top:24px;font-size:12px;color:#94a3b8;">Gestão WAVE · FIP-WAVE</p>
  </div>
</body></html>`
}

export interface NfAguardandoPayload {
  numero_nf: string
  pedido_codigo: string
  valor: number
  lancado_por: string
}
/** Enviado aos aprovadores quando a contratada lança uma NF. */
export function templateNfAguardandoAprovacao(p: NfAguardandoPayload): { subject: string; html: string } {
  const subject = `NF ${p.numero_nf} aguardando aprovação — pedido ${p.pedido_codigo}`
  const html = layout('NF aguardando aprovação', `
    <p style="color:#334155;font-size:14px;line-height:1.6;">
      <strong>${escapeHtml(p.lancado_por)}</strong> lançou a NF
      <strong>${escapeHtml(p.numero_nf)}</strong> (${fmtBRL(p.valor)}) no pedido
      <strong>${escapeHtml(p.pedido_codigo)}</strong>. Acesse o sistema para aprovar
      ou rejeitar o lançamento.
    </p>`)
  return { subject, html }
}

export interface NfAprovadaPayload {
  numero_nf: string
  pedido_codigo: string
  valor: number
}
/** Enviado à contratada quando o contratante aprova a NF. */
export function templateNfAprovada(p: NfAprovadaPayload): { subject: string; html: string } {
  const subject = `NF ${p.numero_nf} aprovada — pedido ${p.pedido_codigo}`
  const html = layout('NF aprovada', `
    <p style="color:#334155;font-size:14px;line-height:1.6;">
      A NF <strong>${escapeHtml(p.numero_nf)}</strong> (${fmtBRL(p.valor)}) do pedido
      <strong>${escapeHtml(p.pedido_codigo)}</strong> foi <strong>aprovada</strong>.
    </p>`)
  return { subject, html }
}

export interface NfEmCorrecaoPayload {
  numero_nf: string
  pedido_codigo: string
  motivo: string
}
/** Enviado à contratada quando o contratante rejeita a NF para correção. */
export function templateNfEmCorrecao(p: NfEmCorrecaoPayload): { subject: string; html: string } {
  const subject = `NF ${p.numero_nf} precisa de correção — pedido ${p.pedido_codigo}`
  const html = layout('NF devolvida para correção', `
    <p style="color:#334155;font-size:14px;line-height:1.6;">
      A NF <strong>${escapeHtml(p.numero_nf)}</strong> do pedido
      <strong>${escapeHtml(p.pedido_codigo)}</strong> foi devolvida para correção.
    </p>
    <p style="background:#fef2f2;border-left:3px solid #ef4444;padding:10px 14px;
       color:#991b1b;font-size:14px;border-radius:4px;">
      <strong>Motivo:</strong> ${escapeHtml(p.motivo)}
    </p>
    <p style="color:#334155;font-size:14px;">Ajuste a NF no sistema e reenvie.</p>`)
  return { subject, html }
}
```

- [ ] **Step 2: Verificar o build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep templates-nf-workflow || echo "ok"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add lib/email/templates-nf-workflow.ts
git commit -m "feat(email): templates do workflow de NF"
```

---

## Task 7: Endpoint de lançamento — gate de permissão + status + e-mail

**Files:**
- Modify: `app/api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs/route.ts` (handler `POST`)

- [ ] **Step 1: Adicionar imports**

No topo do arquivo:

```typescript
import { assertPermissao } from '@/lib/api/auth'
import { getPermissoesEfetivas } from '@/lib/db/permissoes'
import { sendEmail } from '@/lib/email/send'
import { templateNfAguardandoAprovacao } from '@/lib/email/templates-nf-workflow'
```

- [ ] **Step 2: Gatear o POST e descobrir se o lançador pode aprovar**

No início do `try` do handler `POST`, logo após `const { solId } = await params`:

```typescript
    const auth = await assertPermissao('nf_fat_direto', 'lancar')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    // Lançador que também tem permissão de aprovar → NF nasce aprovada.
    let lancadorPodeAprovar = auth.isAdmin
    if (!lancadorPodeAprovar) {
      const { permissoes } = await getPermissoesEfetivas(auth.userId)
      lancadorPodeAprovar = permissoes.some(p => p.modulo === 'nf_fat_direto' && p.acao === 'aprovar')
    }
```

- [ ] **Step 3: Passar lançador + permissão para `criarNotaFiscal`**

Na chamada `criarNotaFiscal({ ... })`, adicionar os dois campos:

```typescript
      lancado_por_id: auth.userId,
      lancador_pode_aprovar: lancadorPodeAprovar,
```

- [ ] **Step 4: Disparar e-mail aos aprovadores quando a NF nasce pendente**

Logo após `const nf = await criarNotaFiscal({ ... })` e antes do `return`:

```typescript
    // NF pendente → notifica os aprovadores. Falha de e-mail não derruba o
    // lançamento (sendEmail já loga internamente).
    if ((nf as any)?.status === 'aguardando_aprovacao') {
      const admin2 = createAdminClient()
      const { data: sol } = await admin2
        .from('solicitacoes_fat_direto')
        .select('codigo, contrato_id')
        .eq('id', solId)
        .single()
      const { data: aprovadores } = await admin2
        .from('perfis')
        .select('email')
        .eq('perfil', 'admin')
        .eq('ativo', true)
      const emails = (aprovadores || []).map((a: any) => a.email).filter(Boolean)
      if (emails.length > 0) {
        const tpl = templateNfAguardandoAprovacao({
          numero_nf: nfBody.numero_nf,
          pedido_codigo: (sol as any)?.codigo ?? solId,
          valor: nfBody.valor,
          lancado_por: auth.userEmail ?? 'Contratada',
        })
        await sendEmail({ to: emails, subject: tpl.subject, html: tpl.html, tipo: 'nova_medicao' })
      }
    }
```

> Nota: confirmar o nome real da coluna do código do pedido em `solicitacoes_fat_direto` (ex.: `codigo`, `numero`). Ler o schema da tabela antes; ajustar o `.select` e o uso. Se não houver coluna de código legível, usar o id.

- [ ] **Step 5: Verificar o build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "nfs/route" || echo "ok"`
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add "app/api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs/route.ts"
git commit -m "feat(nf): lancamento gateado por permissao + email aos aprovadores"
```

---

## Task 8: Endpoints de aprovação e de reenvio

**Files:**
- Create: `app/api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs/[nfId]/aprovar/route.ts`
- Create: `app/api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs/[nfId]/route.ts`

- [ ] **Step 1: Criar o endpoint aprovar/rejeitar**

```typescript
// app/api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs/[nfId]/aprovar/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { aprovarNotaFiscal, rejeitarNotaFiscal } from '@/lib/db/nf-workflow'
import { NFMatchError } from '@/lib/db/fat-direto'
import { sendEmail } from '@/lib/email/send'
import { templateNfAprovada, templateNfEmCorrecao } from '@/lib/email/templates-nf-workflow'

export const dynamic = 'force-dynamic'

const Body = z.object({
  acao: z.enum(['aprovar', 'rejeitar']),
  motivo: z.string().trim().max(1000).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string; nfId: string }> },
) {
  try {
    const { solId, nfId } = await params
    const auth = await assertPermissao('nf_fat_direto', 'aprovar')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.issues }, { status: 400 })
    }
    const { acao, motivo } = parsed.data
    const ator = { actor_id: auth.userId, actor_email: auth.userEmail }

    if (acao === 'rejeitar' && !(motivo ?? '').trim()) {
      return NextResponse.json({ error: 'Motivo é obrigatório para rejeitar.' }, { status: 400 })
    }

    if (acao === 'aprovar') await aprovarNotaFiscal(nfId, ator)
    else await rejeitarNotaFiscal(nfId, motivo as string, ator)

    // Notifica a contratada (quem lançou). Falha de e-mail não derruba a ação.
    const admin = createAdminClient()
    const { data: nf } = await admin
      .from('notas_fiscais_fat_direto')
      .select('numero_nf, valor, lancado_por_id')
      .eq('id', nfId)
      .single()
    const { data: sol } = await admin
      .from('solicitacoes_fat_direto')
      .select('codigo')
      .eq('id', solId)
      .single()
    let emailContratada: string | null = null
    if ((nf as any)?.lancado_por_id) {
      const { data: perfil } = await admin
        .from('perfis').select('email').eq('id', (nf as any).lancado_por_id).single()
      emailContratada = (perfil as any)?.email ?? null
    }
    if (emailContratada && nf) {
      const pedidoCodigo = (sol as any)?.codigo ?? solId
      const tpl = acao === 'aprovar'
        ? templateNfAprovada({ numero_nf: (nf as any).numero_nf, pedido_codigo: pedidoCodigo, valor: Number((nf as any).valor) })
        : templateNfEmCorrecao({ numero_nf: (nf as any).numero_nf, pedido_codigo: pedidoCodigo, motivo: (motivo ?? '').trim() })
      await sendEmail({
        to: emailContratada, subject: tpl.subject, html: tpl.html,
        tipo: acao === 'aprovar' ? 'aprovado' : 'ajuste_solicitado',
      })
    }

    return NextResponse.json({ ok: true, acao })
  } catch (e: any) {
    if (e instanceof NFMatchError) {
      return NextResponse.json({ error: e.message, code: e.code, detail: e.detail }, { status: 422 })
    }
    return apiError(e)
  }
}
```

- [ ] **Step 2: Criar o endpoint de reenvio (correção)**

```typescript
// app/api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs/[nfId]/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { validarNotaFiscal3Way, NFMatchError } from '@/lib/db/fat-direto'
import { podeTransicionar, type NfStatus } from '@/lib/db/nf-workflow'
import { audit } from '@/lib/api/audit'
import { sendEmail } from '@/lib/email/send'
import { templateNfAguardandoAprovacao } from '@/lib/email/templates-nf-workflow'
import { cnpj, dataIso } from '@/lib/api/schema'

export const dynamic = 'force-dynamic'

/** Campos editáveis no reenvio de uma NF em correção. */
const Body = z.object({
  numero_nf: z.string().trim().min(1).max(50),
  emitente: z.string().max(500).optional(),
  cnpj_emitente: cnpj().optional(),
  valor: z.number().positive().finite(),
  data_emissao: dataIso(),
  data_recebimento: dataIso().optional(),
  data_vencimento: dataIso().optional(),
  descricao: z.string().max(2000).optional(),
  arquivo_url: z.string().url().optional(),
})

/** PATCH — contratada corrige e reenvia uma NF que estava em em_correcao. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string; nfId: string }> },
) {
  try {
    const { solId, nfId } = await params
    const auth = await assertPermissao('nf_fat_direto', 'lancar')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.issues }, { status: 400 })
    }
    const b = parsed.data

    const admin = createAdminClient()
    const { data: nf, error } = await admin
      .from('notas_fiscais_fat_direto')
      .select('id, status, lancado_por_id')
      .eq('id', nfId)
      .single()
    if (error || !nf) return NextResponse.json({ error: 'NF não encontrada.' }, { status: 404 })
    if (!podeTransicionar(nf.status as NfStatus, 'aguardando_aprovacao')) {
      return NextResponse.json(
        { error: `NF no status "${nf.status}" não pode ser reenviada.` }, { status: 409 })
    }

    // Revalida o 3-way match com os dados corrigidos.
    await validarNotaFiscal3Way({
      solicitacao_id: solId,
      numero_nf: b.numero_nf,
      cnpj_emitente: b.cnpj_emitente,
      valor: b.valor,
      data_emissao: b.data_emissao,
    })

    const { error: upErr } = await admin
      .from('notas_fiscais_fat_direto')
      .update({
        numero_nf: b.numero_nf, emitente: b.emitente ?? null, cnpj_emitente: b.cnpj_emitente ?? null,
        valor: b.valor, data_emissao: b.data_emissao,
        data_recebimento: b.data_recebimento ?? null, data_vencimento: b.data_vencimento ?? null,
        descricao: b.descricao ?? null,
        ...(b.arquivo_url ? { url_arquivo: b.arquivo_url } : {}),
        status: 'aguardando_aprovacao', motivo_rejeicao: null,
      })
      .eq('id', nfId)
    if (upErr) throw upErr

    await audit({
      event: 'nf.reenviada', entity_type: 'nota_fiscal_fat_direto', entity_id: nfId,
      actor_id: auth.userId, actor_email: auth.userEmail,
      metadata: { numero_nf: b.numero_nf, solicitacao_id: solId },
    })

    // Notifica aprovadores (mesmo padrão do lançamento).
    const { data: sol } = await admin
      .from('solicitacoes_fat_direto').select('codigo').eq('id', solId).single()
    const { data: aprovadores } = await admin
      .from('perfis').select('email').eq('perfil', 'admin').eq('ativo', true)
    const emails = (aprovadores || []).map((a: any) => a.email).filter(Boolean)
    if (emails.length > 0) {
      const tpl = templateNfAguardandoAprovacao({
        numero_nf: b.numero_nf, pedido_codigo: (sol as any)?.codigo ?? solId,
        valor: b.valor, lancado_por: auth.userEmail ?? 'Contratada',
      })
      await sendEmail({ to: emails, subject: tpl.subject, html: tpl.html, tipo: 'nova_medicao' })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e instanceof NFMatchError) {
      return NextResponse.json({ error: e.message, code: e.code, detail: e.detail }, { status: 422 })
    }
    return apiError(e)
  }
}
```

> Nota: confirmar o nome real da coluna do arquivo em `notas_fiscais_fat_direto` — a migration 005 usa `url_arquivo`, mas a 021 pode ter renomeado para `arquivo_url`. Ler o schema e ajustar a chave usada no `update`.

- [ ] **Step 3: Verificar o build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "nfs/\[nfId\]" || echo "ok"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/contratos/[id]/fat-direto/solicitacoes/[solId]/nfs/[nfId]/"
git commit -m "feat(nf): endpoints de aprovar/rejeitar e reenvio"
```

---

## Task 9: Somatórios de "pagável" filtram `status='aprovada'`

Dashboards e relatórios devem contar como faturado/pagável apenas NFs `aprovada` — não as pendentes. As pendentes só reservam saldo (Task 3), não "valem".

**Files:**
- Modify: arquivos identificados pelo grep abaixo.

- [ ] **Step 1: Localizar as agregações de NF**

Run:
```bash
grep -rn "notas_fiscais_fat_direto" app/api lib/db --include=*.ts | grep -iE "select|sum|reduce|valor" | grep -v "nfs/route\|nf-workflow\|\[nfId\]"
```

Para cada local que **soma valores de NF** para exibir total faturado / pagável / dashboard (NÃO para o 3-way match — esse foi tratado na Task 3):
- Se a query já filtra por status, trocar para `.eq('status', 'aprovada')`.
- Se não filtra, adicionar `.eq('status', 'aprovada')`.
- Onde o somatório é feito em JS sobre uma lista, filtrar `nf.status === 'aprovada'` antes do `reduce`.

- [ ] **Step 2: Revisar cada ocorrência**

Para cada arquivo encontrado, ler o contexto e decidir:
- É somatório de "quanto já foi faturado/pago"? → filtra `aprovada`.
- É checagem de saldo / 3-way match? → mantém o predicado `nfReservaSaldo` (já feito na Task 3).
- É listagem para exibir todas as NFs de um pedido? → não filtra (mostra todas com o badge de status).

- [ ] **Step 3: Verificar o build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/api|lib/db" || echo "ok"`
Expected: `ok` (ou só erros pré-existentes não relacionados).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(nf): somatorios de pagavel contam so NF aprovada"
```

---

## Task 10: UI — contratante: fila de aprovação em `/nf-fat-direto`

**Files:**
- Modify: `app/(app)/nf-fat-direto/page.tsx`

- [ ] **Step 1: Ler a página atual e identificar o padrão**

Ler `app/(app)/nf-fat-direto/page.tsx` inteira. Identificar como ela lista NFs hoje (fetch, estado, render de linhas) e como outras telas fazem ações com confirmação (ex.: o modal de aprovação em `app/(app)/aprovacoes/page.tsx`).

- [ ] **Step 2: Adicionar a seção "Aguardando aprovação"**

No topo da página, adicionar uma seção/aba que lista as NFs com `status === 'aguardando_aprovacao'`. Cada linha exibe: pedido (código), número da NF, valor, quem lançou (`lancado_por_id` → nome do perfil), data de lançamento, link para o arquivo (`url_arquivo`/`arquivo_url`), e os botões **Aprovar** e **Rejeitar**.

- **Aprovar:** `POST /api/contratos/{contratoId}/fat-direto/solicitacoes/{solId}/nfs/{nfId}/aprovar` com body `{ acao: 'aprovar' }`. Em resposta `422` (match falhou na revalidação), exibir o `error` retornado — o saldo mudou desde o lançamento.
- **Rejeitar:** abrir um campo de motivo obrigatório (textarea); ao confirmar, `POST` com `{ acao: 'rejeitar', motivo }`.
- Após sucesso, recarregar a lista.
- Mostrar um badge de contagem das NFs aguardando aprovação.

- [ ] **Step 3: Badge no menu lateral**

No componente de navegação (procurar onde o item "NF Fat. Direto" é renderizado — provável `components/layout/`), adicionar um contador das NFs `aguardando_aprovacao`, seguindo o padrão de badge já usado por "Aprovações" (a sidebar já mostra um ponto/contador nesse item).

- [ ] **Step 4: Verificar o build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "nf-fat-direto" || echo "ok"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/nf-fat-direto/page.tsx" components/
git commit -m "feat(nf): fila de aprovacao de NF na pagina nf-fat-direto"
```

---

## Task 11: UI — contratada: status das NFs e tela de correção

**Files:**
- Modify: `app/(app)/contratos/[id]/fat-direto/[solId]/page.tsx`

- [ ] **Step 1: Ler a página do pedido e localizar a área de NFs**

Ler `app/(app)/contratos/[id]/fat-direto/[solId]/page.tsx`. Localizar onde as NFs do pedido são listadas e onde fica o formulário/modal de lançar NF.

- [ ] **Step 2: Badge de status em cada NF**

Para cada NF listada, exibir um badge do `status`: `aguardando_aprovacao` (amarelo "Aguardando aprovação"), `aprovada` (verde "Aprovada"), `em_correcao` (vermelho "Em correção"), `cancelada` (cinza "Cancelada").

- [ ] **Step 3: Tela de correção para NF em `em_correcao`**

Quando uma NF está em `em_correcao`:
- Exibir o `motivo_rejeicao` em destaque (caixa vermelha).
- Oferecer um botão "Corrigir e reenviar" que abre o mesmo formulário de NF, pré-preenchido com os dados atuais da NF.
- Ao salvar, chamar `PATCH /api/contratos/{id}/fat-direto/solicitacoes/{solId}/nfs/{nfId}` com os campos. Em `422`, exibir o erro do match. Em sucesso, recarregar.

- [ ] **Step 4: Gatear o botão "Lançar NF" e tratar o 422**

O botão de lançar NF já existe; garantir que o fluxo de POST trate a resposta `422` do 3-way match exibindo a mensagem (pedido sem saldo, valor excedente, duplicata, CNPJ divergente, etc.) — a contratada só consegue lançar NF que cabe no pedido.

- [ ] **Step 5: Verificar o build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "fat-direto/\[solId\]" || echo "ok"`
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/contratos/[id]/fat-direto/[solId]/page.tsx"
git commit -m "feat(nf): status e tela de correcao das NFs no pedido"
```

---

## Task 12: Verificação ponta-a-ponta e deploy

- [ ] **Step 1: Rodar todos os testes unitários**

Run: `npx vitest run`
Expected: PASS — incluindo os 12 testes de `nf-workflow.test.ts`.

- [ ] **Step 2: Build completo**

Run: `npm run build`
Expected: build do Next.js conclui sem erros novos. Erros pré-existentes não relacionados (ex.: `lib/server/optimize-upload.ts` / `pdf-lib`) são aceitáveis — confirmar via `git stash` que não foram introduzidos por este plano.

- [ ] **Step 3: Deploy (Regra 4 do projeto)**

```bash
git checkout main
git pull origin main
git merge claude/relaxed-ishizaka-32ad00 --no-ff -m "merge: workflow de aprovacao de NF fat-direto"
git push origin main
git checkout claude/relaxed-ishizaka-32ad00
```

- [ ] **Step 4: Teste manual em produção (após o build do Vercel)**

Com a migration 065 já aplicada no Supabase:
1. Como contratada (perfil com `nf_fat_direto:lancar`, sem `aprovar`): lançar uma NF num pedido aprovado com saldo → deve criar `aguardando_aprovacao`; admin recebe e-mail.
2. Tentar lançar uma NF com valor acima do saldo → bloqueado (422).
3. Como admin: aprovar a NF → status `aprovada`; contratada recebe e-mail.
4. Lançar outra NF, rejeitar com motivo → status `em_correcao`; contratada recebe e-mail com o motivo.
5. Como contratada: corrigir e reenviar → volta para `aguardando_aprovacao`.
6. Como admin lançando direto: a NF nasce `aprovada` (auto-aprovação).

---

## Self-Review

- **Cobertura do spec:** Ciclo de vida (Tasks 1,2,4,5) · Fluxo 1 lançar (Task 7) · Fluxo 2 aprovar/rejeitar (Task 8) · Fluxo 3 correção (Task 8 PATCH + Task 11) · Modelo de dados (Task 1) · Permissões (Task 1 grant + Tasks 7,8) · Reserva de saldo (Task 3) · "Pagável" só aprovada (Task 9) · Notificações (Tasks 6,7,8) · Casos de borda: revalidação na aprovação (Task 5 `aprovarNotaFiscal`), NF pendente reserva saldo (Task 3) · Telas contratante (Task 10) e contratada (Task 11) · Testes (Task 2 unit + Task 12 e2e). Todos os itens do spec têm task.
- **Pontos que exigem leitura do schema em runtime:** nome da coluna de código do pedido em `solicitacoes_fat_direto` (Tasks 7,8) e nome da coluna de arquivo em `notas_fiscais_fat_direto` — `url_arquivo` vs `arquivo_url` (Task 8). Marcados como Nota nas tasks; o executor confirma antes de codar.
- **Consistência de tipos:** `NfStatus`, `statusInicialNf`, `podeTransicionar`, `nfReservaSaldo`, `aprovarNotaFiscal`, `rejeitarNotaFiscal` definidos na Task 2/5 e usados com a mesma assinatura nas Tasks 3,4,7,8.
