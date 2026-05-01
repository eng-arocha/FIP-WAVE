# Drill-down Navegável na Visão Geral — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o card "Visão Geral" do contrato em uma árvore inline expansível com gráfico sincronizado, e permitir clicar nos números (Realizado/Saldo) para navegar a uma página dedicada de origem (NFs ou pedidos/medições com saldo) que por sua vez leva às rotas existentes de detalhe.

**Architecture:** A interação atual de "clique simples = drill-replace" é substituída por "duplo-clique = expandir árvore inline" + "clique nos números → rota dedicada `/origem`". O gráfico Recharts passa a renderizar a mesma estrutura plana da árvore expandida. Estado de expansão e foco vivem na URL (`?scope=&expand=`). Backend ganha um novo endpoint `/api/contratos/[id]/origem` que reusa cálculos já feitos em `lib/db/dashboard.ts`.

**Tech Stack:** Next.js 15 App Router, React 18+ client components, Recharts, Supabase (admin client), TypeScript, Vitest (smoke).

**Reference:** Spec validada em `docs/superpowers/specs/2026-05-01-drill-down-visao-geral-design.md`

**Test strategy:** O projeto usa vitest apenas para libs puras (sem testes de UI nem endpoints integrados). Cada task termina com:
1. `npx tsc --noEmit` (deve passar)
2. `npm run test` (deve passar — smoke + novos testes de lib pura)
3. Verificação visual no browser nas tasks de UI (descrita em cada uma)

---

## File Structure (mapa de arquivos)

**Criados:**
- `types/origem.ts` — tipos compartilhados de OrigemItem/OrigemResponse
- `lib/db/wbs-utils.ts` — função pura para descobrir descendentes da WBS
- `lib/db/origem.ts` — funções de listagem de notas e saldos para a página origem
- `app/api/contratos/[id]/origem/route.ts` — GET endpoint
- `lib/hooks/use-tree-expansion.ts` — Set<string> sincronizado com URL `?expand=`
- `lib/hooks/use-dashboard-tree-data.ts` — cache + lazy fetch de filhos por scope
- `components/contratos/visao-geral/numero-clicavel.tsx`
- `components/contratos/visao-geral/dashboard-tree-row.tsx`
- `components/contratos/visao-geral/dashboard-bar-chart.tsx`
- `components/contratos/visao-geral/dashboard-tree.tsx`
- `components/contratos/visao-geral/index.ts`
- `app/(app)/contratos/[id]/origem/page.tsx`
- `app/(app)/contratos/[id]/origem/origem-summary.tsx`
- `app/(app)/contratos/[id]/origem/origem-table.tsx`
- `tests/wbs-utils.test.ts` — teste de descendentes
- `tests/origem-helpers.test.ts` — teste das funções de alocação proporcional (puras)

**Modificados:**
- `lib/db/dashboard.ts` — adicionar `getDashboardChildrenByScope(contratoId, modo, scopeId)`
- `app/api/contratos/[id]/dashboard/route.ts` — aceitar `?scope=`
- `app/(app)/contratos/[id]/page.tsx` — substituir bloco de Visão Geral pelo `<DashboardTree>`, remover handlers de drill-replace dos itens, manter Selects para setar `scope`

---

## Pre-flight: baseline de build e branch

- [ ] **Step 0.1: Confirmar build limpo na branch atual**

Run:
```bash
npx tsc --noEmit
npm run test
```
Expected: tsc sem erros; testes passam.

Se houver erros pré-existentes, anotá-los e ignorar (não introduzir novos).

- [ ] **Step 0.2: Confirmar que estamos na branch correta**

Run: `git status && git branch --show-current`
Expected: branch `claude/elastic-lamarr-de960d`, working tree limpo.

---

## Task 1: Tipos compartilhados de Origem

**Files:**
- Create: `types/origem.ts`

- [ ] **Step 1.1: Criar `types/origem.ts`**

```ts
// types/origem.ts
import type { DashboardModo } from './dashboard'

export type OrigemTipo = 'realizado' | 'saldo'

export type OrigemNotaFatDireto = {
  tipo: 'nf-fat-direto'
  id: string
  numero: string
  data: string                 // ISO YYYY-MM-DD
  valorAlocado: number         // porção alocada ao escopo
  valorTotalNf: number         // valor bruto da NF
  status: string               // 'pendente' | 'validada' | 'rejeitada' | ...
  pedidoId: string
  pedidoNumero: string
}

export type OrigemNotaWave = {
  tipo: 'nf-wave'
  id: string
  numero: string
  data: string
  valorAlocado: number
  valorTotalNf: number
  status: string
  medicaoId: string
  medicaoNumero: string
}

export type OrigemPedidoSaldo = {
  tipo: 'pedido-saldo'
  id: string
  numero: string
  aprovadoEm: string | null
  aprovado: number
  emNf: number
  saldo: number
}

export type OrigemMedicaoSaldo = {
  tipo: 'medicao-saldo'
  id: string
  numero: string
  aprovadoEm: string | null
  aprovado: number
  emNf: number
  saldo: number
}

export type OrigemItem =
  | OrigemNotaFatDireto
  | OrigemNotaWave
  | OrigemPedidoSaldo
  | OrigemMedicaoSaldo

export type OrigemScope = {
  id: string | null
  codigo: string
  nome: string
  nivel: 1 | 2 | 3 | null      // null = raiz (todo o contrato)
} | null

export type OrigemResumoStatus = {
  validadas?: number
  pendentes?: number
  rejeitadas?: number
}

export type OrigemResponse = {
  total: number                // soma dos valorAlocado / saldo
  count: number                // quantidade de itens retornados
  itens: OrigemItem[]
  resumoStatus?: OrigemResumoStatus
  scope: OrigemScope
  modo: DashboardModo
  origem: OrigemTipo
}
```

- [ ] **Step 1.2: tsc + commit**

```bash
npx tsc --noEmit
git add types/origem.ts
git commit -m "feat(types): tipos OrigemItem e OrigemResponse para drill-down

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 2: Helper puro de descoberta de descendentes da WBS

**Files:**
- Create: `lib/db/wbs-utils.ts`
- Create: `tests/wbs-utils.test.ts`

Esta task isola o cálculo "dado um scope (grupo, tarefa, detalhamento ou null), me dá o conjunto de detalhamento_ids que pertencem àquele escopo". É puro: recebe os arrays de grupos/tarefas/detalhamentos já carregados e devolve um `Set<string>`.

- [ ] **Step 2.1: Criar `lib/db/wbs-utils.ts`**

```ts
// lib/db/wbs-utils.ts

export type WbsNode = {
  id: string
  pai_id: string | null
  nivel: 1 | 2 | 3
}

/**
 * Dado um scopeId (qualquer nível) ou null, retorna o conjunto de IDs
 * de todos os DETALHAMENTOS (nível 3) descendentes desse escopo.
 * Se scopeId for null, retorna todos os detalhamentos.
 * Se scopeId for um detalhamento, retorna apenas { scopeId }.
 */
export function descendantDetalhamentoIds(
  scopeId: string | null,
  nodes: WbsNode[],
): Set<string> {
  const all = nodes
  const detalhamentos = all.filter(n => n.nivel === 3)

  if (scopeId === null) {
    return new Set(detalhamentos.map(d => d.id))
  }

  const scope = all.find(n => n.id === scopeId)
  if (!scope) return new Set()

  if (scope.nivel === 3) return new Set([scopeId])

  // BFS para coletar descendentes
  const out = new Set<string>()
  const queue = [scopeId]
  const childrenByPai = new Map<string, WbsNode[]>()
  for (const n of all) {
    if (n.pai_id) {
      const arr = childrenByPai.get(n.pai_id) ?? []
      arr.push(n)
      childrenByPai.set(n.pai_id, arr)
    }
  }
  while (queue.length) {
    const cur = queue.shift()!
    const children = childrenByPai.get(cur) ?? []
    for (const c of children) {
      if (c.nivel === 3) out.add(c.id)
      else queue.push(c.id)
    }
  }
  return out
}

/**
 * Resolve o scope (qualquer nível) para metadata exibível.
 */
export function resolveScopeInfo(
  scopeId: string | null,
  nodes: Array<WbsNode & { codigo: string; nome: string }>,
): { id: string | null; codigo: string; nome: string; nivel: 1 | 2 | 3 | null } | null {
  if (scopeId === null) {
    return { id: null, codigo: '', nome: 'Todos os grupos', nivel: null }
  }
  const n = nodes.find(x => x.id === scopeId)
  if (!n) return null
  return { id: n.id, codigo: n.codigo, nome: n.nome, nivel: n.nivel }
}
```

- [ ] **Step 2.2: Criar `tests/wbs-utils.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { descendantDetalhamentoIds, type WbsNode } from '@/lib/db/wbs-utils'

const nodes: WbsNode[] = [
  { id: 'g1', pai_id: null, nivel: 1 },
  { id: 'g2', pai_id: null, nivel: 1 },
  { id: 't1.1', pai_id: 'g1', nivel: 2 },
  { id: 't1.2', pai_id: 'g1', nivel: 2 },
  { id: 't2.1', pai_id: 'g2', nivel: 2 },
  { id: 'd1.1.1', pai_id: 't1.1', nivel: 3 },
  { id: 'd1.1.2', pai_id: 't1.1', nivel: 3 },
  { id: 'd1.2.1', pai_id: 't1.2', nivel: 3 },
  { id: 'd2.1.1', pai_id: 't2.1', nivel: 3 },
]

describe('descendantDetalhamentoIds', () => {
  it('null retorna todos os detalhamentos', () => {
    const r = descendantDetalhamentoIds(null, nodes)
    expect(r).toEqual(new Set(['d1.1.1', 'd1.1.2', 'd1.2.1', 'd2.1.1']))
  })

  it('grupo retorna apenas detalhamentos sob ele', () => {
    const r = descendantDetalhamentoIds('g1', nodes)
    expect(r).toEqual(new Set(['d1.1.1', 'd1.1.2', 'd1.2.1']))
  })

  it('tarefa retorna apenas seus filhos', () => {
    const r = descendantDetalhamentoIds('t1.1', nodes)
    expect(r).toEqual(new Set(['d1.1.1', 'd1.1.2']))
  })

  it('detalhamento retorna apenas si mesmo', () => {
    const r = descendantDetalhamentoIds('d1.2.1', nodes)
    expect(r).toEqual(new Set(['d1.2.1']))
  })

  it('id inexistente retorna vazio', () => {
    const r = descendantDetalhamentoIds('xxxx', nodes)
    expect(r).toEqual(new Set())
  })
})
```

- [ ] **Step 2.3: Rodar testes**

Run: `npx tsc --noEmit && npm run test -- tests/wbs-utils.test.ts`
Expected: tsc sem erros novos; 5 testes passam.

- [ ] **Step 2.4: Commit**

```bash
git add lib/db/wbs-utils.ts tests/wbs-utils.test.ts
git commit -m "feat(lib): wbs-utils com descendantDetalhamentoIds (puro + testado)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 3: Adaptar `lib/db/dashboard.ts` para suportar `scope`

**Files:**
- Modify: `lib/db/dashboard.ts`
- Modify: `app/api/contratos/[id]/dashboard/route.ts`

A função atual `getDashboardData(contratoId, filtros)` usa `grupo_id/tarefa_id/detalhamento_id` para fazer drill-replace. Vou adicionar uma nova função `getDashboardChildrenByScope(contratoId, modo, scopeId)` que retorna os filhos diretos do `scopeId` (ou nível 1 se `scopeId` for null), reusando os mesmos cálculos já existentes para `realizado_*`, `saldo_*`, etc. A função antiga continua existindo para compat até a próxima task de cleanup.

- [ ] **Step 3.1: Ler `lib/db/dashboard.ts` para entender estrutura atual**

Run: `wc -l lib/db/dashboard.ts && head -100 lib/db/dashboard.ts`

Identificar:
- Onde `getDashboardData` é exportada
- Quais funções/maps de cálculo são reutilizáveis (realizadoServicoDet, realizadoMaterialDet, aprovadoMaterialDet, nfWaveServicoDet)
- Como itens são agrupados por nível

- [ ] **Step 3.2: Adicionar `getDashboardChildrenByScope` ao final do arquivo**

A função recebe `(contratoId, scopeId | null)` e retorna `{ itens: DashboardItem[], scope: ScopeInfo | null, breadcrumb: BreadcrumbItem[] }`.

Algoritmo:
1. Se `scopeId === null` → comportamento equivalente ao `getDashboardData` sem filtros (nível 1, todos os grupos).
2. Se `scopeId` for um grupo → retorna nível 2 (tarefas do grupo).
3. Se `scopeId` for uma tarefa → retorna nível 3 (detalhamentos da tarefa).
4. Se `scopeId` for um detalhamento → retorna `[scopeNode]` como item único (sem filhos).
5. Breadcrumb é montado seguindo `pai_id` até a raiz.

```ts
// Adicionar ao final de lib/db/dashboard.ts (sem remover funções existentes ainda)

export async function getDashboardChildrenByScope(
  contratoId: string,
  scopeId: string | null,
): Promise<{
  itens: DashboardItem[]
  scope: { id: string | null; codigo: string; nome: string; nivel: 1 | 2 | 3 | null } | null
  breadcrumb: Array<{ id: string; codigo: string; nome: string; nivel: 1 | 2 | 3 }>
}> {
  // Reusar a lógica existente: chamar getDashboardData com filtros derivados do scopeId.
  // Para isso, descobrir o nível do scopeId primeiro.
  const admin = createAdminClient()
  let filtros: { grupo_id?: string | null; tarefa_id?: string | null; detalhamento_id?: string | null } = {}
  let scopeInfo: { id: string | null; codigo: string; nome: string; nivel: 1 | 2 | 3 | null } | null = {
    id: null, codigo: '', nome: 'Todos os grupos', nivel: null,
  }

  if (scopeId !== null) {
    // Tentar achar nos 3 níveis
    const grupo = await admin.from('grupos_macro').select('id, codigo, nome').eq('id', scopeId).maybeSingle()
    if (grupo.data) {
      filtros = { grupo_id: scopeId }
      scopeInfo = { id: scopeId, codigo: grupo.data.codigo, nome: grupo.data.nome, nivel: 1 }
    } else {
      const tarefa = await admin.from('tarefas').select('id, codigo, nome').eq('id', scopeId).maybeSingle()
      if (tarefa.data) {
        filtros = { tarefa_id: scopeId }
        scopeInfo = { id: scopeId, codigo: tarefa.data.codigo, nome: tarefa.data.nome, nivel: 2 }
      } else {
        const det = await admin.from('detalhamentos').select('id, codigo, descricao').eq('id', scopeId).maybeSingle()
        if (det.data) {
          filtros = { detalhamento_id: scopeId }
          scopeInfo = { id: scopeId, codigo: det.data.codigo, nome: det.data.descricao, nivel: 3 }
        } else {
          scopeInfo = null
        }
      }
    }
  }

  const result = await getDashboardData(contratoId, filtros)
  return { itens: result.itens, scope: scopeInfo, breadcrumb: result.breadcrumb }
}
```

Nota: se `createAdminClient` não estiver importado no topo do arquivo, importar.

- [ ] **Step 3.3: Modificar API `/api/contratos/[id]/dashboard/route.ts` para aceitar `?scope=`**

Edit `app/api/contratos/[id]/dashboard/route.ts`:
- Ler `searchParams.get('scope')` antes de ler `grupo_id/tarefa_id/detalhamento_id`.
- Se `scope` estiver presente, chamar `getDashboardChildrenByScope` em vez de `getDashboardData`.
- Manter o caminho antigo (com `grupo_id/tarefa_id/detalhamento_id`) intacto para compat.

```ts
import { getDashboardData, getDashboardChildrenByScope } from '@/lib/db/dashboard'
// ...
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url)
  const scopeRaw = url.searchParams.get('scope')

  if (scopeRaw !== null) {
    // Novo caminho via scope
    const scopeId = scopeRaw === '' || scopeRaw === 'null' ? null : scopeRaw
    const data = await getDashboardChildrenByScope(params.id, scopeId)
    return NextResponse.json(data)
  }

  // Caminho legado (mantido para compat enquanto componente novo não substitui tudo)
  const grupo_id = url.searchParams.get('grupo_id') ?? null
  const tarefa_id = url.searchParams.get('tarefa_id') ?? null
  const detalhamento_id = url.searchParams.get('detalhamento_id') ?? null
  const data = await getDashboardData(params.id, { grupo_id, tarefa_id, detalhamento_id })
  return NextResponse.json(data)
}
```

- [ ] **Step 3.4: Smoke test manual via curl**

Run o dev server em background:
```bash
npm run dev
```

Aguardar o servidor responder (porta 3000).

Run:
```bash
curl -s "http://localhost:3000/api/contratos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/dashboard?scope=" | head -c 500
curl -s "http://localhost:3000/api/contratos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/dashboard" | head -c 500
```

Expected: ambos retornam JSON com `itens` populado. O primeiro deve ser equivalente ao segundo (scope vazio = todos os grupos).

Parar o dev server.

- [ ] **Step 3.5: tsc + test + commit**

```bash
npx tsc --noEmit
npm run test
git add lib/db/dashboard.ts app/api/contratos/[id]/dashboard/route.ts
git commit -m "feat(api): dashboard aceita ?scope= (substitui grupo/tarefa/det)

Mantém caminho legado intacto; novo caminho devolve filhos diretos
do scope (ou nivel 1 se scope=null/vazio).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 4: Backend de listagem de origem (`lib/db/origem.ts`)

**Files:**
- Create: `lib/db/origem.ts`
- Create: `tests/origem-helpers.test.ts`

A lógica aqui é parecida com a já feita em `dashboard.ts`, mas em vez de agregar somas por detalhamento, retorna a lista detalhada de itens (notas ou pedidos com saldo). Reusa a alocação proporcional já implementada.

- [ ] **Step 4.1: Extrair função pura de alocação proporcional**

Adicionar em `lib/db/origem.ts`:

```ts
// lib/db/origem.ts
import { createAdminClient } from '@/lib/supabase-admin'
import { descendantDetalhamentoIds, type WbsNode } from './wbs-utils'
import type {
  OrigemItem,
  OrigemNotaFatDireto,
  OrigemNotaWave,
  OrigemPedidoSaldo,
  OrigemMedicaoSaldo,
  OrigemResponse,
  OrigemTipo,
} from '@/types/origem'
import type { DashboardModo } from '@/types/dashboard'

/**
 * Aloca um valor de NF proporcionalmente entre seus itens, somente
 * considerando os que pertencem ao escopo (alvosDetIds).
 * Retorna o valor alocado total. Se nenhum item está no escopo, retorna 0.
 */
export function allocateNfToScope(
  itens: Array<{ detalhamento_id: string | null; valor_total: number }>,
  alvosDetIds: Set<string>,
  valorTotalNf: number,
): number {
  const totalSol = itens.reduce((s, it) => s + (Number(it.valor_total) || 0), 0)
  if (totalSol <= 0) return 0
  const totalNoEscopo = itens.reduce((s, it) => {
    if (it.detalhamento_id && alvosDetIds.has(it.detalhamento_id)) {
      return s + (Number(it.valor_total) || 0)
    }
    return s
  }, 0)
  if (totalNoEscopo <= 0) return 0
  return valorTotalNf * (totalNoEscopo / totalSol)
}
```

- [ ] **Step 4.2: Criar teste para `allocateNfToScope`**

`tests/origem-helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { allocateNfToScope } from '@/lib/db/origem'

describe('allocateNfToScope', () => {
  it('aloca proporcionalmente quando todos os itens estao no escopo', () => {
    const itens = [
      { detalhamento_id: 'd1', valor_total: 60 },
      { detalhamento_id: 'd2', valor_total: 40 },
    ]
    const r = allocateNfToScope(itens, new Set(['d1', 'd2']), 1000)
    expect(r).toBe(1000)
  })

  it('aloca apenas a parcela do escopo', () => {
    const itens = [
      { detalhamento_id: 'd1', valor_total: 60 },
      { detalhamento_id: 'd2', valor_total: 40 },
    ]
    const r = allocateNfToScope(itens, new Set(['d1']), 1000)
    expect(r).toBeCloseTo(600, 6)
  })

  it('retorna 0 se nenhum item esta no escopo', () => {
    const itens = [{ detalhamento_id: 'd1', valor_total: 100 }]
    expect(allocateNfToScope(itens, new Set(['dx']), 500)).toBe(0)
  })

  it('retorna 0 se total de itens for zero', () => {
    expect(allocateNfToScope([], new Set(['d1']), 500)).toBe(0)
  })

  it('ignora itens sem detalhamento_id', () => {
    const itens = [
      { detalhamento_id: null, valor_total: 50 },
      { detalhamento_id: 'd1', valor_total: 50 },
    ]
    const r = allocateNfToScope(itens, new Set(['d1']), 200)
    // total geral é 100, alvo é 50 → metade do valor da NF
    expect(r).toBeCloseTo(100, 6)
  })
})
```

Run: `npm run test -- tests/origem-helpers.test.ts`
Expected: 5 testes passam.

- [ ] **Step 4.3: Implementar `listOrigemRealizadoMaterial`**

Adicionar em `lib/db/origem.ts`:

```ts
export async function listOrigemRealizadoMaterial(
  contratoId: string,
  alvosDetIds: Set<string>,
): Promise<OrigemNotaFatDireto[]> {
  const admin = createAdminClient()

  // Buscar solicitações aprovadas com seus itens e NFs
  const { data: solicitacoes, error } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id,
      numero,
      itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total ),
      nfs:notas_fiscais_fat_direto!solicitacao_id ( id, numero_nf, data_emissao, valor, status )
    `)
    .eq('contrato_id', contratoId)
    .eq('status', 'aprovado')
    .is('deletado_em', null)

  if (error || !solicitacoes) return []

  const out: OrigemNotaFatDireto[] = []
  for (const sol of solicitacoes) {
    const itens = (sol.itens ?? []) as Array<{ detalhamento_id: string | null; valor_total: number }>
    const nfs = (sol.nfs ?? []) as Array<{ id: string; numero_nf: string; data_emissao: string; valor: number; status: string }>

    for (const nf of nfs) {
      if (nf.status === 'rejeitada') continue
      const valorAlocado = allocateNfToScope(itens, alvosDetIds, Number(nf.valor) || 0)
      if (valorAlocado <= 0) continue
      out.push({
        tipo: 'nf-fat-direto',
        id: nf.id,
        numero: String(nf.numero_nf ?? ''),
        data: String(nf.data_emissao ?? ''),
        valorAlocado,
        valorTotalNf: Number(nf.valor) || 0,
        status: String(nf.status ?? ''),
        pedidoId: sol.id,
        pedidoNumero: String(sol.numero ?? ''),
      })
    }
  }
  return out
}
```

Nota: confirmar nome da coluna `data_emissao` na tabela `notas_fiscais_fat_direto`. Se for diferente (ex: `emitida_em`), ajustar.

- [ ] **Step 4.4: Implementar `listOrigemRealizadoServico`**

```ts
export async function listOrigemRealizadoServico(
  contratoId: string,
  alvosDetIds: Set<string>,
): Promise<OrigemNotaWave[]> {
  const admin = createAdminClient()

  // 1. NFs Wave (pendentes/validadas) do contrato
  let nfWaveData: Array<{ id: string; numero_nf: string; data_emissao: string; valor: number; status: string; medicao_id: string }> = []
  try {
    const { data, error } = await admin
      .from('notas_fiscais_wave')
      .select('id, numero_nf, data_emissao, valor, status, medicao_id')
      .eq('contrato_id', contratoId)
      .in('status', ['pendente', 'validada'])
    if (!error && data) nfWaveData = data
  } catch {
    return []   // tabela não existe — sem NFs Wave para listar
  }

  if (nfWaveData.length === 0) return []

  // 2. Para cada medicao_id encontrada, buscar itens (medicao_itens) e número da medição
  const medicaoIds = Array.from(new Set(nfWaveData.map(n => n.medicao_id))).filter(Boolean)
  if (medicaoIds.length === 0) return []

  const [{ data: medicoes }, { data: itensMed }] = await Promise.all([
    admin.from('medicoes').select('id, numero').in('id', medicaoIds),
    admin
      .from('medicao_itens')
      .select('medicao_id, detalhamento_id, valor_medido')
      .in('medicao_id', medicaoIds),
  ])

  const medicaoNumeroById = new Map<string, string>()
  for (const m of medicoes ?? []) medicaoNumeroById.set(m.id, String(m.numero ?? ''))

  // Agrupar itens por medição
  const itensPorMedicao = new Map<string, Array<{ detalhamento_id: string | null; valor_total: number }>>()
  for (const it of itensMed ?? []) {
    const arr = itensPorMedicao.get(it.medicao_id) ?? []
    arr.push({ detalhamento_id: it.detalhamento_id, valor_total: Number(it.valor_medido) || 0 })
    itensPorMedicao.set(it.medicao_id, arr)
  }

  const out: OrigemNotaWave[] = []
  for (const nf of nfWaveData) {
    const itens = itensPorMedicao.get(nf.medicao_id) ?? []
    const valorAlocado = allocateNfToScope(itens, alvosDetIds, Number(nf.valor) || 0)
    if (valorAlocado <= 0) continue
    out.push({
      tipo: 'nf-wave',
      id: nf.id,
      numero: String(nf.numero_nf ?? ''),
      data: String(nf.data_emissao ?? ''),
      valorAlocado,
      valorTotalNf: Number(nf.valor) || 0,
      status: String(nf.status ?? ''),
      medicaoId: nf.medicao_id,
      medicaoNumero: medicaoNumeroById.get(nf.medicao_id) ?? '',
    })
  }
  return out
}
```

- [ ] **Step 4.5: Implementar `listOrigemSaldoMaterial`**

Pedidos FAT direto aprovados com saldo > 0 (aprovado − soma de NFs não-rejeitadas) que tocam o escopo.

```ts
export async function listOrigemSaldoMaterial(
  contratoId: string,
  alvosDetIds: Set<string>,
): Promise<OrigemPedidoSaldo[]> {
  const admin = createAdminClient()

  const { data: solicitacoes, error } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id,
      numero,
      data_aprovacao,
      itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total ),
      nfs:notas_fiscais_fat_direto!solicitacao_id ( valor, status )
    `)
    .eq('contrato_id', contratoId)
    .eq('status', 'aprovado')
    .is('deletado_em', null)

  if (error || !solicitacoes) return []

  const out: OrigemPedidoSaldo[] = []
  for (const sol of solicitacoes) {
    const itens = (sol.itens ?? []) as Array<{ detalhamento_id: string | null; valor_total: number }>
    const aprovadoEscopo = itens.reduce((s, it) => {
      if (it.detalhamento_id && alvosDetIds.has(it.detalhamento_id)) {
        return s + (Number(it.valor_total) || 0)
      }
      return s
    }, 0)
    if (aprovadoEscopo <= 0) continue

    const totalSol = itens.reduce((s, it) => s + (Number(it.valor_total) || 0), 0)
    const totalNfs = (sol.nfs ?? [])
      .filter((n: { status: string }) => n.status !== 'rejeitada')
      .reduce((s: number, n: { valor: number }) => s + (Number(n.valor) || 0), 0)
    const emNfEscopo = totalSol > 0 ? totalNfs * (aprovadoEscopo / totalSol) : 0
    const saldo = Math.max(0, aprovadoEscopo - emNfEscopo)
    if (saldo <= 0) continue

    out.push({
      tipo: 'pedido-saldo',
      id: sol.id,
      numero: String(sol.numero ?? ''),
      aprovadoEm: sol.data_aprovacao ? String(sol.data_aprovacao) : null,
      aprovado: aprovadoEscopo,
      emNf: emNfEscopo,
      saldo,
    })
  }
  return out
}
```

Nota: confirmar nome da coluna `data_aprovacao` em `solicitacoes_fat_direto`. Pode ser `aprovado_em` ou outro. Ajustar se necessário.

- [ ] **Step 4.6: Implementar `listOrigemSaldoServico`**

Medições aprovadas com saldo > 0 (realizado_servico − NFs Wave) que tocam o escopo.

```ts
export async function listOrigemSaldoServico(
  contratoId: string,
  alvosDetIds: Set<string>,
): Promise<OrigemMedicaoSaldo[]> {
  const admin = createAdminClient()

  const { data: medicoes, error } = await admin
    .from('medicoes')
    .select(`
      id,
      numero,
      data_aprovacao,
      itens:medicao_itens ( detalhamento_id, valor_medido )
    `)
    .eq('contrato_id', contratoId)
    .eq('status', 'aprovado')

  if (error || !medicoes) return []

  // Buscar NFs Wave por medicao_id (se a tabela existir)
  const medicaoIds = medicoes.map(m => m.id)
  const nfWavePorMedicao = new Map<string, number>()
  try {
    const { data: nfs } = await admin
      .from('notas_fiscais_wave')
      .select('medicao_id, valor, status')
      .eq('contrato_id', contratoId)
      .in('status', ['pendente', 'validada'])
      .in('medicao_id', medicaoIds)
    for (const nf of nfs ?? []) {
      const cur = nfWavePorMedicao.get(nf.medicao_id) ?? 0
      nfWavePorMedicao.set(nf.medicao_id, cur + (Number(nf.valor) || 0))
    }
  } catch {
    // sem tabela; nfWavePorMedicao fica vazio
  }

  const out: OrigemMedicaoSaldo[] = []
  for (const med of medicoes) {
    const itens = (med.itens ?? []) as Array<{ detalhamento_id: string | null; valor_medido: number }>
    const realizadoEscopo = itens.reduce((s, it) => {
      if (it.detalhamento_id && alvosDetIds.has(it.detalhamento_id)) {
        return s + (Number(it.valor_medido) || 0)
      }
      return s
    }, 0)
    if (realizadoEscopo <= 0) continue

    const totalMed = itens.reduce((s, it) => s + (Number(it.valor_medido) || 0), 0)
    const totalNfs = nfWavePorMedicao.get(med.id) ?? 0
    const emNfEscopo = totalMed > 0 ? totalNfs * (realizadoEscopo / totalMed) : 0
    const saldo = Math.max(0, realizadoEscopo - emNfEscopo)
    if (saldo <= 0) continue

    out.push({
      tipo: 'medicao-saldo',
      id: med.id,
      numero: String(med.numero ?? ''),
      aprovadoEm: med.data_aprovacao ? String(med.data_aprovacao) : null,
      aprovado: realizadoEscopo,
      emNf: emNfEscopo,
      saldo,
    })
  }
  return out
}
```

- [ ] **Step 4.7: Função orquestradora `listOrigem`**

```ts
export async function listOrigem(
  contratoId: string,
  modo: DashboardModo,
  origem: OrigemTipo,
  alvosDetIds: Set<string>,
): Promise<OrigemItem[]> {
  if (origem === 'realizado') {
    if (modo === 'material') return listOrigemRealizadoMaterial(contratoId, alvosDetIds)
    if (modo === 'servico')  return listOrigemRealizadoServico(contratoId, alvosDetIds)
    // total: junta os dois
    const [m, s] = await Promise.all([
      listOrigemRealizadoMaterial(contratoId, alvosDetIds),
      listOrigemRealizadoServico(contratoId, alvosDetIds),
    ])
    return [...m, ...s]
  }
  // saldo
  if (modo === 'material') return listOrigemSaldoMaterial(contratoId, alvosDetIds)
  if (modo === 'servico')  return listOrigemSaldoServico(contratoId, alvosDetIds)
  // total + saldo: combinação não suportada (UI desabilita o clique)
  const [m, s] = await Promise.all([
    listOrigemSaldoMaterial(contratoId, alvosDetIds),
    listOrigemSaldoServico(contratoId, alvosDetIds),
  ])
  return [...m, ...s]
}
```

- [ ] **Step 4.8: tsc + commit**

```bash
npx tsc --noEmit
npm run test
git add lib/db/origem.ts tests/origem-helpers.test.ts
git commit -m "feat(lib): origem.ts com listagem de NFs e pedidos/medicoes com saldo

Reusa logica de alocacao proporcional ja em dashboard.ts. Funcao
allocateNfToScope extraida e testada (5 unit tests).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 5: API endpoint `/api/contratos/[id]/origem`

**Files:**
- Create: `app/api/contratos/[id]/origem/route.ts`

- [ ] **Step 5.1: Criar route handler**

```ts
// app/api/contratos/[id]/origem/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { descendantDetalhamentoIds, type WbsNode } from '@/lib/db/wbs-utils'
import { listOrigem } from '@/lib/db/origem'
import type { DashboardModo } from '@/types/dashboard'
import type { OrigemResponse, OrigemTipo, OrigemResumoStatus } from '@/types/origem'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const url = new URL(req.url)
  const modoRaw = url.searchParams.get('modo') ?? 'total'
  const origemRaw = url.searchParams.get('origem') ?? 'realizado'
  const scopeRaw = url.searchParams.get('scope')
  const scopeId = scopeRaw === null || scopeRaw === '' || scopeRaw === 'null' ? null : scopeRaw

  const modo = (['total', 'material', 'servico'] as const).includes(modoRaw as DashboardModo)
    ? (modoRaw as DashboardModo) : 'total'
  const origem: OrigemTipo = origemRaw === 'saldo' ? 'saldo' : 'realizado'

  const admin = createAdminClient()

  // Carregar nós da WBS para mapear scope → detalhamentos
  const [grupos, tarefas, dets] = await Promise.all([
    admin.from('grupos_macro').select('id, codigo, nome').eq('contrato_id', params.id),
    admin.from('tarefas').select('id, codigo, nome, grupo_macro_id'),
    admin.from('detalhamentos').select('id, codigo, descricao, tarefa_id'),
  ])

  const nodes: Array<WbsNode & { codigo: string; nome: string }> = [
    ...((grupos.data ?? []).map(g => ({ id: g.id, pai_id: null as string | null, nivel: 1 as const, codigo: String(g.codigo), nome: String(g.nome) }))),
    ...((tarefas.data ?? []).map(t => ({ id: t.id, pai_id: t.grupo_macro_id as string | null, nivel: 2 as const, codigo: String(t.codigo), nome: String(t.nome) }))),
    ...((dets.data ?? []).map(d => ({ id: d.id, pai_id: d.tarefa_id as string | null, nivel: 3 as const, codigo: String(d.codigo), nome: String(d.descricao) }))),
  ]

  const alvos = descendantDetalhamentoIds(scopeId, nodes)
  const itens = await listOrigem(params.id, modo, origem, alvos)

  // Total e contagem
  const total = itens.reduce((s, it) => {
    if (it.tipo === 'nf-fat-direto' || it.tipo === 'nf-wave') return s + it.valorAlocado
    return s + it.saldo
  }, 0)

  // Resumo de status (para realizado)
  let resumoStatus: OrigemResumoStatus | undefined = undefined
  if (origem === 'realizado') {
    resumoStatus = { validadas: 0, pendentes: 0, rejeitadas: 0 }
    for (const it of itens) {
      if (it.tipo === 'nf-fat-direto' || it.tipo === 'nf-wave') {
        const s = String(it.status ?? '').toLowerCase()
        if (s === 'validada') resumoStatus.validadas! += 1
        else if (s === 'pendente') resumoStatus.pendentes! += 1
        else if (s === 'rejeitada') resumoStatus.rejeitadas! += 1
      }
    }
  }

  // Scope info
  let scopeInfo: OrigemResponse['scope'] = null
  if (scopeId === null) {
    scopeInfo = { id: null, codigo: '', nome: 'Todos os grupos', nivel: null }
  } else {
    const node = nodes.find(n => n.id === scopeId)
    if (node) {
      scopeInfo = { id: node.id, codigo: node.codigo, nome: node.nome, nivel: node.nivel }
    }
  }

  // Ordenar por data desc (notas) ou aprovado desc (saldos)
  itens.sort((a, b) => {
    const da = 'data' in a ? a.data : (a.aprovadoEm ?? '')
    const db = 'data' in b ? b.data : (b.aprovadoEm ?? '')
    return db.localeCompare(da)
  })

  const response: OrigemResponse = {
    total,
    count: itens.length,
    itens,
    resumoStatus,
    scope: scopeInfo,
    modo,
    origem,
  }
  return NextResponse.json(response)
}
```

- [ ] **Step 5.2: Smoke manual via curl**

```bash
npm run dev
# em outro terminal:
curl -s "http://localhost:3000/api/contratos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/origem?modo=material&origem=realizado&scope=" | head -c 500
curl -s "http://localhost:3000/api/contratos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/origem?modo=servico&origem=saldo&scope=" | head -c 500
```

Expected: JSON com `total`, `count`, `itens`. Pode ter `count: 0` se não houver dados — ok.

- [ ] **Step 5.3: tsc + commit**

```bash
npx tsc --noEmit
git add app/api/contratos/[id]/origem/route.ts
git commit -m "feat(api): GET /api/contratos/[id]/origem para drill-down

Aceita ?modo=&origem=&scope=. Devolve itens (NFs ou pedidos/medicoes
com saldo), total, contagem e resumo de status.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 6: Hook `use-tree-expansion`

**Files:**
- Create: `lib/hooks/use-tree-expansion.ts`

- [ ] **Step 6.1: Criar hook**

```ts
// lib/hooks/use-tree-expansion.ts
'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const PARAM = 'expand'

export function useTreeExpansion() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const expandedIds = useMemo(() => {
    const raw = params.get(PARAM)
    if (!raw) return new Set<string>()
    return new Set(raw.split(',').filter(Boolean))
  }, [params])

  const setExpanded = useCallback(
    (next: Set<string>) => {
      const qs = new URLSearchParams(params.toString())
      if (next.size === 0) qs.delete(PARAM)
      else qs.set(PARAM, Array.from(next).join(','))
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
    },
    [params, pathname, router],
  )

  const toggle = useCallback((id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }, [expandedIds, setExpanded])

  const expand = useCallback((id: string) => {
    if (expandedIds.has(id)) return
    const next = new Set(expandedIds)
    next.add(id)
    setExpanded(next)
  }, [expandedIds, setExpanded])

  const collapse = useCallback((id: string) => {
    if (!expandedIds.has(id)) return
    const next = new Set(expandedIds)
    next.delete(id)
    setExpanded(next)
  }, [expandedIds, setExpanded])

  const isExpanded = useCallback((id: string) => expandedIds.has(id), [expandedIds])

  const collapseAll = useCallback(() => setExpanded(new Set()), [setExpanded])

  return { expandedIds, isExpanded, toggle, expand, collapse, collapseAll }
}
```

- [ ] **Step 6.2: tsc + commit**

```bash
npx tsc --noEmit
git add lib/hooks/use-tree-expansion.ts
git commit -m "feat(hooks): useTreeExpansion sincroniza Set<string> com URL ?expand=

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 7: Hook `use-dashboard-tree-data`

**Files:**
- Create: `lib/hooks/use-dashboard-tree-data.ts`

Cache em ref + estado de loading por scope. Carrega filhos sob demanda.

- [ ] **Step 7.1: Criar hook**

```ts
// lib/hooks/use-dashboard-tree-data.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardItem } from '@/types/dashboard'

type ChildrenCache = Map<string | 'root', DashboardItem[]>
type LoadingMap = Map<string | 'root', boolean>

const ROOT_KEY = 'root' as const

function keyFor(scopeId: string | null): string | 'root' {
  return scopeId === null ? ROOT_KEY : scopeId
}

export function useDashboardTreeData(contratoId: string, modo: string) {
  const cacheRef = useRef<ChildrenCache>(new Map())
  const loadingRef = useRef<LoadingMap>(new Map())
  const [, force] = useState(0)

  const fetchChildren = useCallback(async (scopeId: string | null): Promise<DashboardItem[]> => {
    const k = keyFor(scopeId)
    if (cacheRef.current.has(k)) return cacheRef.current.get(k)!
    if (loadingRef.current.get(k)) return []
    loadingRef.current.set(k, true)
    force(n => n + 1)
    try {
      const url = new URL(`/api/contratos/${contratoId}/dashboard`, window.location.origin)
      url.searchParams.set('modo', modo)
      url.searchParams.set('scope', scopeId ?? '')
      const res = await fetch(url.toString(), { cache: 'no-store' })
      if (!res.ok) throw new Error(`dashboard fetch ${res.status}`)
      const data = await res.json()
      const itens: DashboardItem[] = data.itens ?? []
      cacheRef.current.set(k, itens)
      return itens
    } catch (e) {
      console.error('[useDashboardTreeData] fetch error', e)
      cacheRef.current.set(k, [])
      return []
    } finally {
      loadingRef.current.delete(k)
      force(n => n + 1)
    }
  }, [contratoId, modo])

  const isLoading = useCallback((scopeId: string | null) => {
    return loadingRef.current.get(keyFor(scopeId)) === true
  }, [])

  const getCached = useCallback((scopeId: string | null) => {
    return cacheRef.current.get(keyFor(scopeId))
  }, [])

  const invalidate = useCallback(() => {
    cacheRef.current.clear()
    force(n => n + 1)
  }, [])

  // Carregar root automaticamente
  useEffect(() => {
    invalidate()
    fetchChildren(null)
  }, [contratoId, modo, fetchChildren, invalidate])

  return { fetchChildren, isLoading, getCached, invalidate }
}
```

- [ ] **Step 7.2: tsc + commit**

```bash
npx tsc --noEmit
git add lib/hooks/use-dashboard-tree-data.ts
git commit -m "feat(hooks): useDashboardTreeData com cache + lazy fetch por scope

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 8: Componente `NumeroClicavel`

**Files:**
- Create: `components/contratos/visao-geral/numero-clicavel.tsx`

Célula de número que vira botão acessível quando clicável (cursor pointer + hover + foco).

- [ ] **Step 8.1: Criar componente**

```tsx
// components/contratos/visao-geral/numero-clicavel.tsx
'use client'

import { forwardRef } from 'react'

type Props = {
  value: number
  format?: (v: number) => string
  onClick?: () => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

const defaultFormat = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const NumeroClicavel = forwardRef<HTMLButtonElement, Props>(function NumeroClicavel(
  { value, format = defaultFormat, onClick, disabled, ariaLabel, className },
  ref,
) {
  const clickable = !disabled && typeof onClick === 'function' && value > 0
  if (!clickable) {
    return <span className={className}>{format(value)}</span>
  }
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={[
        className ?? '',
        'cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-80 hover:decoration-solid focus:outline-none focus:ring-1 focus:ring-[var(--accent-1)] rounded-sm',
      ].join(' ')}
    >
      {format(value)}
    </button>
  )
})
```

- [ ] **Step 8.2: tsc + commit**

```bash
npx tsc --noEmit
git add components/contratos/visao-geral/numero-clicavel.tsx
git commit -m "feat(visao-geral): NumeroClicavel (celula de valor com cursor/foco/aria)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 9: Componente `DashboardTreeRow`

**Files:**
- Create: `components/contratos/visao-geral/dashboard-tree-row.tsx`

Linha individual da tabela árvore. Recebe item, level, expanded, e callbacks. Lê o `viewMode` para escolher quais colunas renderizar.

- [ ] **Step 9.1: Criar componente**

```tsx
// components/contratos/visao-geral/dashboard-tree-row.tsx
'use client'

import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { memo } from 'react'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'
import { NumeroClicavel } from './numero-clicavel'

type Props = {
  item: DashboardItem
  level: number                          // 0 = root, 1 = filho, ...
  expanded: boolean
  loading: boolean
  modo: DashboardModo
  onToggle: () => void
  onClickRealizado?: () => void
  onClickSaldo?: () => void
}

function getValores(item: DashboardItem, modo: DashboardModo) {
  if (modo === 'material') {
    return {
      contratado: item.valor_contratado_material,
      realizado: item.realizado_material,
      saldo: item.saldo_aprovado_material,
      saldoLabel: 'Saldo aprovado',
    }
  }
  if (modo === 'servico') {
    return {
      contratado: item.valor_contratado_servico,
      realizado: item.realizado_servico,
      saldo: item.saldo_medicao_servico,
      saldoLabel: 'Saldo medição',
    }
  }
  return {
    contratado: item.valor_contratado_total,
    realizado: item.realizado_total,
    saldo: 0,                            // total não tem saldo único
    saldoLabel: '—',
  }
}

export const DashboardTreeRow = memo(function DashboardTreeRow({
  item, level, expanded, loading, modo, onToggle, onClickRealizado, onClickSaldo,
}: Props) {
  const v = getValores(item, modo)
  const podeExpandir = item.tem_filhos
  const indent = level * 16

  return (
    <div
      role="treeitem"
      aria-level={level + 1}
      aria-expanded={podeExpandir ? expanded : undefined}
      className="grid grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr] items-center gap-2 px-2 py-1.5 hover:bg-[var(--surface-2)] border-b border-[var(--border-1)] cursor-default"
      onDoubleClick={() => { if (podeExpandir) onToggle() }}
      style={{ paddingLeft: `${indent + 8}px` }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {podeExpandir ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? 'Colapsar' : 'Expandir'}
            className="p-0.5 rounded hover:bg-[var(--surface-3)] text-[var(--text-3)]"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : expanded
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="font-mono text-[11px] text-[var(--text-3)] tabular-nums">{item.codigo}</span>
        <span className="truncate text-sm text-[var(--text-1)]">{item.nome}</span>
      </div>
      <div className="text-right tabular-nums text-sm text-[var(--text-2)]">
        {v.contratado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="text-right tabular-nums text-sm text-[var(--text-1)]">
        <NumeroClicavel
          value={v.realizado}
          onClick={onClickRealizado}
          ariaLabel={`Ver notas que compoem realizado de ${item.nome}`}
        />
      </div>
      <div className="text-right tabular-nums text-sm text-[var(--text-1)]">
        {modo === 'total' ? (
          <span className="text-[var(--text-3)]">
            {v.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : (
          <NumeroClicavel
            value={v.saldo}
            onClick={onClickSaldo}
            ariaLabel={`Ver pedidos com saldo de ${item.nome}`}
          />
        )}
      </div>
    </div>
  )
})
```

- [ ] **Step 9.2: tsc + commit**

```bash
npx tsc --noEmit
git add components/contratos/visao-geral/dashboard-tree-row.tsx
git commit -m "feat(visao-geral): DashboardTreeRow (linha com expand + cliques nos numeros)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 10: Componente `DashboardBarChart`

**Files:**
- Create: `components/contratos/visao-geral/dashboard-bar-chart.tsx`

Recharts horizontal BarChart que recebe a árvore plana visível. Cada barra tem 3 segmentos (Contratado, Realizado, Saldo) e indentação no rótulo da YAxis para refletir o nível.

- [ ] **Step 10.1: Criar componente**

```tsx
// components/contratos/visao-geral/dashboard-bar-chart.tsx
'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'

type FlatItem = { item: DashboardItem; level: number }

type Props = {
  itens: FlatItem[]
  modo: DashboardModo
  onDoubleClickItem: (item: DashboardItem) => void
  onClickRealizado: (item: DashboardItem) => void
  onClickSaldo: (item: DashboardItem) => void
  height?: number
}

const COLORS = {
  contratado: '#3f3f46',
  realizado: '#3b82f6',
  saldo: '#eab308',
}

function buildRows(itens: FlatItem[], modo: DashboardModo) {
  return itens.map(({ item, level }) => {
    let contratado = item.valor_contratado_total
    let realizado = item.realizado_total
    let saldo = 0
    if (modo === 'material') {
      contratado = item.valor_contratado_material
      realizado = item.realizado_material
      saldo = item.saldo_aprovado_material
    } else if (modo === 'servico') {
      contratado = item.valor_contratado_servico
      realizado = item.realizado_servico
      saldo = item.saldo_medicao_servico
    }
    return {
      id: item.id,
      label: `${'  '.repeat(level)}${item.codigo} ${item.nome}`,
      contratado, realizado, saldo,
      _item: item,
    }
  })
}

export function DashboardBarChart({ itens, modo, onDoubleClickItem, onClickRealizado, onClickSaldo, height = 320 }: Props) {
  const rows = buildRows(itens, modo)

  return (
    <div style={{ width: '100%', height: Math.max(height, rows.length * 32 + 48) }}>
      <ResponsiveContainer>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid stroke="var(--border-1)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-3)' }} />
          <YAxis
            dataKey="label"
            type="category"
            width={220}
            tick={{ fontSize: 11, fill: 'var(--text-2)' }}
            interval={0}
          />
          <Tooltip
            contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', fontSize: 12 }}
            formatter={(v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          />
          <Bar
            dataKey="contratado"
            fill={COLORS.contratado}
            onDoubleClick={(_d, _i, e) => {
              const r = (e as any)?.payload?._item ?? rows[_i]?._item
              if (r) onDoubleClickItem(r)
            }}
          />
          <Bar
            dataKey="realizado"
            fill={COLORS.realizado}
            onClick={(_d, _i, e) => {
              const r = (e as any)?.payload?._item ?? rows[_i]?._item
              if (r) onClickRealizado(r)
            }}
            onDoubleClick={(_d, _i, e) => {
              const r = (e as any)?.payload?._item ?? rows[_i]?._item
              if (r) onDoubleClickItem(r)
            }}
            style={{ cursor: 'pointer' }}
          />
          {modo !== 'total' && (
            <Bar
              dataKey="saldo"
              fill={COLORS.saldo}
              onClick={(_d, _i, e) => {
                const r = (e as any)?.payload?._item ?? rows[_i]?._item
                if (r) onClickSaldo(r)
              }}
              onDoubleClick={(_d, _i, e) => {
                const r = (e as any)?.payload?._item ?? rows[_i]?._item
                if (r) onDoubleClickItem(r)
              }}
              style={{ cursor: 'pointer' }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

Nota: Recharts não tem timing nativo entre `onClick` e `onDoubleClick` em Bar. O comportamento real é: `onClick` dispara em todos os cliques (incluindo o primeiro do par); `onDoubleClick` dispara após o segundo. Para evitar abrir a página de origem ao tentar expandir, vamos usar uma proteção temporal mínima dentro do orquestrador (Task 11) — ali envolvemos os callbacks num pequeno guard de 250ms.

- [ ] **Step 10.2: tsc + commit**

```bash
npx tsc --noEmit
git add components/contratos/visao-geral/dashboard-bar-chart.tsx
git commit -m "feat(visao-geral): DashboardBarChart com barras Contratado/Realizado/Saldo

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 11: Componente orquestrador `DashboardTree`

**Files:**
- Create: `components/contratos/visao-geral/dashboard-tree.tsx`
- Create: `components/contratos/visao-geral/index.ts`

Combina hooks + linha + gráfico. Faz a "achatação" da árvore visível.

- [ ] **Step 11.1: Criar `index.ts` para barrel export**

```ts
// components/contratos/visao-geral/index.ts
export { DashboardTree } from './dashboard-tree'
export { DashboardBarChart } from './dashboard-bar-chart'
export { DashboardTreeRow } from './dashboard-tree-row'
export { NumeroClicavel } from './numero-clicavel'
```

- [ ] **Step 11.2: Criar `dashboard-tree.tsx`**

```tsx
// components/contratos/visao-geral/dashboard-tree.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'
import { useTreeExpansion } from '@/lib/hooks/use-tree-expansion'
import { useDashboardTreeData } from '@/lib/hooks/use-dashboard-tree-data'
import { DashboardTreeRow } from './dashboard-tree-row'
import { DashboardBarChart } from './dashboard-bar-chart'

type Props = {
  contratoId: string
  modo: DashboardModo
}

type FlatItem = { item: DashboardItem; level: number }

const DOUBLE_CLICK_GUARD_MS = 250

export function DashboardTree({ contratoId, modo }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const { expandedIds, isExpanded, toggle } = useTreeExpansion()
  const { fetchChildren, isLoading, getCached } = useDashboardTreeData(contratoId, modo)

  // Garantir que filhos de nós expandidos sejam carregados
  useEffect(() => {
    expandedIds.forEach(id => {
      if (!getCached(id)) fetchChildren(id)
    })
  }, [expandedIds, fetchChildren, getCached])

  // Achatar árvore visível
  const flat = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = []
    const root = getCached(null) ?? []

    function walk(items: DashboardItem[], level: number) {
      for (const item of items) {
        out.push({ item, level })
        if (item.tem_filhos && expandedIds.has(item.id)) {
          const children = getCached(item.id) ?? []
          walk(children, level + 1)
        }
      }
    }
    walk(root, 0)
    return out
  }, [expandedIds, getCached])

  // Handlers
  const lastClickRef = useRef<{ id: string; t: number } | null>(null)

  const onToggle = useCallback((item: DashboardItem) => {
    if (!item.tem_filhos) return
    if (!getCached(item.id)) fetchChildren(item.id)
    toggle(item.id)
  }, [fetchChildren, getCached, toggle])

  const goToOrigem = useCallback((item: DashboardItem, origem: 'realizado' | 'saldo') => {
    // Guard: se houve duplo-clique no mesmo item recente, ignora (é expansão).
    const now = Date.now()
    const last = lastClickRef.current
    if (last && last.id === item.id && now - last.t < DOUBLE_CLICK_GUARD_MS) {
      lastClickRef.current = null
      return
    }
    lastClickRef.current = { id: item.id, t: now }

    setTimeout(() => {
      // Se outro click chegou nesse intervalo, last mudou — abortar
      const cur = lastClickRef.current
      if (!cur || cur.id !== item.id || cur.t !== now) return
      const url = new URL(`/contratos/${contratoId}/origem`, window.location.origin)
      url.searchParams.set('modo', modo)
      url.searchParams.set('origem', origem)
      url.searchParams.set('scope', item.id)
      // Preservar a URL atual pra botão "voltar"
      const from = `${pathname}?${params.toString()}`
      url.searchParams.set('from', from)
      router.push(url.pathname + url.search)
    }, DOUBLE_CLICK_GUARD_MS)
  }, [contratoId, modo, pathname, params, router])

  const onDoubleClickFromChart = useCallback((item: DashboardItem) => {
    // Marca como "ocupado" pra cancelar a navegação pendente do click simples
    lastClickRef.current = { id: item.id, t: Date.now() }
    onToggle(item)
  }, [onToggle])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" role="tree">
      <div className="border border-[var(--border-1)] rounded-md overflow-hidden bg-[var(--surface-1)]">
        <div className="grid grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr] items-center gap-2 px-2 py-1.5 text-[10px] uppercase text-[var(--text-3)] border-b border-[var(--border-1)] bg-[var(--surface-2)]">
          <div>Item</div>
          <div className="text-right">Contratado</div>
          <div className="text-right">Realizado</div>
          <div className="text-right">{modo === 'material' ? 'Saldo aprov.' : modo === 'servico' ? 'Saldo med.' : 'Saldo'}</div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {flat.length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--text-3)]">Carregando…</div>
          ) : flat.map(({ item, level }) => (
            <DashboardTreeRow
              key={`${item.id}-${level}`}
              item={item}
              level={level}
              expanded={isExpanded(item.id)}
              loading={isLoading(item.id)}
              modo={modo}
              onToggle={() => onToggle(item)}
              onClickRealizado={item.realizado_total > 0 || item.realizado_material > 0 || item.realizado_servico > 0
                ? () => goToOrigem(item, 'realizado')
                : undefined}
              onClickSaldo={modo !== 'total' && (
                (modo === 'material' && item.saldo_aprovado_material > 0) ||
                (modo === 'servico' && item.saldo_medicao_servico > 0)
              ) ? () => goToOrigem(item, 'saldo') : undefined}
            />
          ))}
        </div>
      </div>
      <div className="border border-[var(--border-1)] rounded-md p-2 bg-[var(--surface-1)] overflow-x-auto">
        <DashboardBarChart
          itens={flat}
          modo={modo}
          onDoubleClickItem={onDoubleClickFromChart}
          onClickRealizado={(item) => goToOrigem(item, 'realizado')}
          onClickSaldo={(item) => goToOrigem(item, 'saldo')}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 11.3: tsc + commit**

```bash
npx tsc --noEmit
git add components/contratos/visao-geral/dashboard-tree.tsx components/contratos/visao-geral/index.ts
git commit -m "feat(visao-geral): DashboardTree orquestrador (arvore + grafico sincronizados)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 12: Página `/origem` (route + components)

**Files:**
- Create: `app/(app)/contratos/[id]/origem/page.tsx`
- Create: `app/(app)/contratos/[id]/origem/origem-summary.tsx`
- Create: `app/(app)/contratos/[id]/origem/origem-table.tsx`

- [ ] **Step 12.1: Criar `origem-summary.tsx` (Client)**

```tsx
// app/(app)/contratos/[id]/origem/origem-summary.tsx
'use client'

import type { OrigemResponse } from '@/types/origem'

export function OrigemSummary({ data }: { data: OrigemResponse }) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="flex flex-wrap items-center gap-4 px-3 py-2 border-b border-[var(--border-1)] bg-[var(--surface-2)] text-sm">
      <div>📊 <strong>{fmt(data.total)}</strong> total</div>
      <div>📄 <strong>{data.count}</strong> {data.origem === 'realizado' ? 'notas' : 'pedidos/medições'}</div>
      {data.resumoStatus && (
        <div className="ml-auto text-xs text-[var(--text-3)] flex items-center gap-3">
          {data.resumoStatus.validadas! > 0 && <span><span className="text-emerald-500">●</span> {data.resumoStatus.validadas} validadas</span>}
          {data.resumoStatus.pendentes! > 0 && <span><span className="text-amber-500">●</span> {data.resumoStatus.pendentes} pendentes</span>}
          {data.resumoStatus.rejeitadas! > 0 && <span><span className="text-rose-500">●</span> {data.resumoStatus.rejeitadas} rejeitadas</span>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 12.2: Criar `origem-table.tsx` (Client)**

```tsx
// app/(app)/contratos/[id]/origem/origem-table.tsx
'use client'

import { useRouter } from 'next/navigation'
import type { OrigemItem, OrigemResponse } from '@/types/origem'

export function OrigemTable({ data, contratoId }: { data: OrigemResponse; contratoId: string }) {
  const router = useRouter()
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const onDouble = (item: OrigemItem) => {
    if (item.tipo === 'nf-fat-direto' || item.tipo === 'pedido-saldo') {
      const id = item.tipo === 'nf-fat-direto' ? item.pedidoId : item.id
      router.push(`/contratos/${contratoId}/fat-direto/${id}`)
    } else if (item.tipo === 'nf-wave' || item.tipo === 'medicao-saldo') {
      const id = item.tipo === 'nf-wave' ? item.medicaoId : item.id
      router.push(`/contratos/${contratoId}/medicoes/${id}`)
    }
  }

  if (data.itens.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-[var(--text-3)]">
        <p>Nenhum item encontrado para este escopo.</p>
      </div>
    )
  }

  const isNotasView = data.origem === 'realizado'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase text-[var(--text-3)] border-b border-[var(--border-1)] bg-[var(--surface-2)]">
          {isNotasView ? (
            <tr>
              <th className="text-left px-3 py-2">NF</th>
              <th className="text-left px-3 py-2">Data</th>
              <th className="text-left px-3 py-2">Pedido / Medição</th>
              <th className="text-right px-3 py-2">Valor alocado</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Tipo</th>
            </tr>
          ) : (
            <tr>
              <th className="text-left px-3 py-2">Pedido / Medição</th>
              <th className="text-left px-3 py-2">Aprovado em</th>
              <th className="text-right px-3 py-2">Aprovado</th>
              <th className="text-right px-3 py-2">Em NF</th>
              <th className="text-right px-3 py-2">Saldo</th>
              <th className="text-left px-3 py-2">Tipo</th>
            </tr>
          )}
        </thead>
        <tbody>
          {data.itens.map((it) => (
            <tr
              key={`${it.tipo}-${it.id}`}
              onDoubleClick={() => onDouble(it)}
              className="border-b border-[var(--border-1)] hover:bg-[var(--surface-2)] cursor-pointer"
              title="Duplo-clique abre o pedido/medição de origem"
            >
              {isNotasView ? (
                <>
                  <td className="px-3 py-2 font-mono text-xs">{('numero' in it) ? it.numero : ''}</td>
                  <td className="px-3 py-2 text-xs text-[var(--text-3)]">{('data' in it) ? it.data : ''}</td>
                  <td className="px-3 py-2 text-xs text-[var(--accent-1)]">
                    {it.tipo === 'nf-fat-direto' ? it.pedidoNumero : it.tipo === 'nf-wave' ? it.medicaoNumero : ''}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{('valorAlocado' in it) ? fmt(it.valorAlocado) : ''}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={['inline-block px-1.5 py-0.5 rounded text-[10px]',
                      ('status' in it ? it.status : '') === 'validada' ? 'bg-emerald-500/15 text-emerald-500'
                      : ('status' in it ? it.status : '') === 'pendente' ? 'bg-amber-500/15 text-amber-500'
                      : 'bg-zinc-500/15 text-zinc-400',
                    ].join(' ')}>{('status' in it) ? it.status : ''}</span>
                  </td>
                  <td className="px-3 py-2 text-[10px] uppercase text-[var(--text-3)]">{it.tipo === 'nf-fat-direto' ? 'FAT direto' : 'Medição'}</td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2 font-mono text-xs">{('numero' in it) ? it.numero : ''}</td>
                  <td className="px-3 py-2 text-xs text-[var(--text-3)]">{('aprovadoEm' in it) ? (it.aprovadoEm ?? '—') : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{('aprovado' in it) ? fmt(it.aprovado) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-3)]">{('emNf' in it) ? fmt(it.emNf) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-500 font-semibold">{('saldo' in it) ? fmt(it.saldo) : ''}</td>
                  <td className="px-3 py-2 text-[10px] uppercase text-[var(--text-3)]">{it.tipo === 'pedido-saldo' ? 'FAT direto' : 'Medição'}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 12.3: Criar `page.tsx` (Server Component)**

```tsx
// app/(app)/contratos/[id]/origem/page.tsx
import { headers } from 'next/headers'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { OrigemSummary } from './origem-summary'
import { OrigemTable } from './origem-table'
import type { OrigemResponse } from '@/types/origem'

export const dynamic = 'force-dynamic'

async function fetchOrigem(contratoId: string, search: URLSearchParams): Promise<OrigemResponse | null> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const base = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const url = `${base}/api/contratos/${contratoId}/origem?${search.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

export default async function OrigemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') search.set(k, v)
    else if (Array.isArray(v) && v[0]) search.set(k, v[0])
  }
  if (!search.get('modo')) search.set('modo', 'total')
  if (!search.get('origem')) search.set('origem', 'realizado')

  const from = search.get('from')
  const data = await fetchOrigem(id, search)
  const backHref = from ?? `/contratos/${id}?modo=${search.get('modo')}`

  if (!data) {
    return (
      <div className="p-6">
        <Link href={backHref} className="text-sm text-[var(--accent-1)] hover:underline">← Voltar</Link>
        <p className="mt-4 text-sm text-[var(--text-3)]">Não foi possível carregar os dados.</p>
      </div>
    )
  }

  const titulo = `${data.origem === 'realizado' ? 'Notas' : 'Saldo'} · ${data.modo === 'material' ? 'Material' : data.modo === 'servico' ? 'Serviço' : 'Total'}`
  const escopoLabel = data.scope?.codigo
    ? `${data.scope.codigo} · ${data.scope.nome}`
    : 'Todo o contrato'

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 mb-4 text-sm">
        <Link href={backHref} className="inline-flex items-center gap-1 text-[var(--accent-1)] hover:underline">
          <ChevronLeft className="w-4 h-4" /> Voltar à Visão Geral
        </Link>
      </div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[var(--text-1)]">{titulo}</h1>
        <p className="text-xs text-[var(--text-3)] mt-1">Escopo: {escopoLabel}</p>
      </div>
      <div className="border border-[var(--border-1)] rounded-md overflow-hidden bg-[var(--surface-1)]">
        <OrigemSummary data={data} />
        <OrigemTable data={data} contratoId={id} />
      </div>
      <p className="mt-3 text-xs text-[var(--text-3)]">
        Dica: <strong>duplo-clique</strong> em uma linha abre o pedido FAT direto ou medição de origem.
      </p>
    </div>
  )
}
```

- [ ] **Step 12.4: tsc + commit**

```bash
npx tsc --noEmit
git add app/(app)/contratos/[id]/origem/
git commit -m "feat(origem): pagina /contratos/[id]/origem com tabela e summary

Lista NFs (origem=realizado) ou pedidos/medicoes com saldo (origem=saldo).
Duplo-clique numa linha leva para a rota existente do FAT direto ou medicao.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 13: Integrar `DashboardTree` em `app/(app)/contratos/[id]/page.tsx`

**Files:**
- Modify: `app/(app)/contratos/[id]/page.tsx`

A page.tsx atual tem ~1600 linhas. Precisamos:
1. Importar `DashboardTree`
2. Substituir o bloco da Visão Geral (linhas aproximadas 984-1207 segundo o mapeamento) pelo `<DashboardTree contratoId={id} modo={viewMode} />`.
3. Manter os Selects de filtro (Grupo/Tarefa/Detalhamento) e os botões de modo, mas eles agora setam `?scope=`.
4. Remover o `handleClick` antigo que fazia drill-replace.
5. Manter o `MaximizableCard` wrapper, mas adicionar `data-no-maximize` no container interno do `DashboardTree` (ou desabilitar o `onDoubleClick` do MaximizableCard especificamente para a tabela e o gráfico).
6. Manter o botão `Maximize2` dedicado existente.
7. Remover o estado `dashboardData`/`dashboardLoading`/`fullscreenChart` para o gráfico antigo (mantém apenas o `fullscreenChart` para o card "pedidos" se for outro componente).

- [ ] **Step 13.1: Ler estrutura atual da Visão Geral**

Run: `grep -n "visao-geral\|<TabsContent value=\"visao\|<MaximizableCard\|setFiltros\|fullscreenChart" app/\(app\)/contratos/\[id\]/page.tsx | head -60`

Identificar:
- O wrapper `MaximizableCard` que envolve a Visão Geral
- O bloco do `<TabsContent value="visao-geral">` (ou similar)
- A função `handleClick` do drill-replace
- Os usos de `setFiltros({ grupo, tarefa, det })` no contexto da Visão Geral
- Os Selects de filtro

- [ ] **Step 13.2: Substituir conteúdo do TabsContent "visao-geral"**

Substituir o bloco que renderiza o gráfico+tabela pela renderização do `<DashboardTree>`. Remover o `handleClick` antigo (que era apenas para drill-replace) e o estado `dashboardData` se ele não for usado em outro lugar.

Alteração esperada (resumida):

```tsx
// Antes (linhas aproximadas 984-1207)
<TabsContent value="visao-geral">
  <MaximizableCard ...>
    <Card>
      ... breadcrumb antigo ...
      ... selects de filtro ...
      <div className="grid grid-cols-2">
        <BarChart .../>
        <Tabela onClick={handleClick} ... />
      </div>
    </Card>
  </MaximizableCard>
</TabsContent>

// Depois
<TabsContent value="visao-geral">
  <MaximizableCard ...>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Visão Geral</h3>
          <div className="flex items-center gap-2">
            {/* Selects de filtro mantidos, mas onValueChange seta scope */}
            <Select value={scope ?? 'todos'} onValueChange={(v) => setFiltros({ scope: v === 'todos' ? null : v })}>
              <SelectTrigger className="h-7 text-xs w-[180px]">
                <SelectValue placeholder="Escopo: todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os grupos</SelectItem>
                {gruposParaSelect.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.codigo} · {g.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={viewMode} onValueChange={(v) => setFiltros({ modo: v })}>
              <SelectTrigger className="h-7 text-xs w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="total">Total</SelectItem>
                <SelectItem value="material">Material</SelectItem>
                <SelectItem value="servico">Serviço</SelectItem>
              </SelectContent>
            </Select>
            <button onClick={() => setFullscreenChart('bar')} className="p-1 rounded hover:bg-[var(--surface-3)]" title="Tela cheia">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent data-no-maximize>
        <DashboardTree contratoId={params.id} modo={viewMode} />
      </CardContent>
    </Card>
  </MaximizableCard>
</TabsContent>
```

- [ ] **Step 13.3: Adaptar `setFiltros` para aceitar `scope`**

Localizar `function setFiltros(...)` na page.tsx (~linha 141-152) e adicionar suporte ao param `scope`. O comportamento de `grupo/tarefa/det` continua existindo para compat (até cleanup posterior).

```tsx
function setFiltros(next: Partial<{ modo: string; scope: string | null; grupo: string | null; tarefa: string | null; det: string | null; sort: string }>) {
  const qs = new URLSearchParams(searchParams.toString())
  for (const [k, v] of Object.entries(next)) {
    if (v === null || v === undefined) qs.delete(k)
    else qs.set(k, String(v))
  }
  // Quando muda modo ou scope, limpar expand (filhos podem não bater)
  if ('modo' in next || 'scope' in next) qs.delete('expand')
  router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
}
```

E adicionar leitura: `const scope = searchParams.get('scope')`.

- [ ] **Step 13.4: Desabilitar duplo-clique do MaximizableCard sobre a árvore**

O `MaximizableCard` (em `components/ui/maximizable-card.tsx:75-87`) ignora cliques que tenham `[data-no-maximize]` no path. Garantir que o container do `DashboardTree` tenha esse atributo (já incluído no Step 13.2 via `<CardContent data-no-maximize>`).

Alternativa: adicionar `data-no-maximize` como prop do `<DashboardTree>` no nível root.

Verificar com inspeção visual no browser que duplo-clique na linha/barra NÃO abre o fullscreen.

- [ ] **Step 13.5: Remover código morto**

- Remover a função `handleClick` antiga no escopo da Visão Geral
- Remover `dashboardData`/`setDashboardData`/`dashboardLoading` se não forem usados em outro lugar (verificar com grep)
- Remover importações não usadas (Recharts diretos da page.tsx, se DashboardTree os encapsula)

Run: `npx tsc --noEmit`

Erros de "import não usado" devem ser corrigidos removendo o import.

- [ ] **Step 13.6: Verificação manual no browser**

```bash
npm run dev
```

Abrir: `http://localhost:3000/contratos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?modo=material`

Validar:
- [ ] Tabela carrega com nível 1 (grupos macro)
- [ ] Gráfico renderiza barras lado-a-lado da tabela
- [ ] Duplo-clique numa linha expande filhos (barra também passa a mostrar filhos)
- [ ] Outro duplo-clique colapsa
- [ ] Chevron clicável faz a mesma coisa
- [ ] Clique no número "Realizado" navega para `/origem?origem=realizado&...`
- [ ] Clique no número "Saldo aprovado" navega para `/origem?origem=saldo&...`
- [ ] Botão "Voltar à Visão Geral" retorna preservando o `?expand=`
- [ ] Duplo-clique na linha da página origem abre `/fat-direto/[id]` ou `/medicoes/[id]`
- [ ] Maximize via botão dedicado funciona (mostra Visão Geral em fullscreen)
- [ ] Recarregar a página com `?expand=g1,t1.3` mantém estado

Anotar issues e ajustar antes de commitar.

- [ ] **Step 13.7: tsc + test + commit**

```bash
npx tsc --noEmit
npm run test
git add app/\(app\)/contratos/\[id\]/page.tsx
git commit -m "feat(contratos): substitui Visao Geral por DashboardTree (drill-down via expansao)

Remove handleClick de drill-replace; selects de filtro agora setam ?scope=.
Botao maximize continua funcionando via icone dedicado. Numeros Realizado/Saldo
navegam para /contratos/[id]/origem com escopo do item.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 14: Validação final cruzada e ajustes de polimento

**Files:** vários (depende dos ajustes encontrados)

- [ ] **Step 14.1: Validar fluxo completo no browser para os 3 modos**

```bash
npm run dev
```

Para cada modo (`total`, `material`, `servico`), validar manualmente:
- [ ] Visão Geral renderiza
- [ ] Drill expande/colapsa em pelo menos 2 níveis (grupo → tarefa → detalhamento)
- [ ] Gráfico está sincronizado
- [ ] Clique em Realizado abre página origem com itens listados (ou empty state se for o caso)
- [ ] Clique em Saldo (apenas em material/servico) abre página origem com pedidos/medições
- [ ] Em modo Total, número Saldo NÃO é clicável
- [ ] Voltar funciona
- [ ] Drill da origem em duplo-clique abre rota de detalhe

Anotar bugs e corrigir cada um com commit pequeno.

- [ ] **Step 14.2: Build de produção**

Run:
```bash
npm run build
```

Expected: build conclui sem erros.

Se houver warnings novos, avaliar — apenas erros bloqueiam.

- [ ] **Step 14.3: Smoke completo dos testes**

Run: `npm run test`
Expected: todos os testes (incluindo os novos `wbs-utils.test.ts` e `origem-helpers.test.ts`) passam.

- [ ] **Step 14.4: Commit de polimento (se houve correções)**

```bash
git add -A
git commit -m "fix(visao-geral): polimento pos-validacao manual

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

Se não houve mudanças, pular este step.

---

## Task 15: Deploy automático (regra 4 do CLAUDE.md)

**Aplicável quando:** estado estável (passo 14 concluído sem regressões), build limpo.

- [ ] **Step 15.1: Sincronizar com main**

```bash
git fetch origin
git checkout main
git pull origin main
```

- [ ] **Step 15.2: Merge --no-ff da branch de feature**

```bash
git merge claude/elastic-lamarr-de960d --no-ff -m "Merge: drill-down navegavel na Visao Geral

- Visao Geral vira arvore inline expansivel (substitui drill-replace)
- Grafico Recharts sincronizado linha-a-linha com a tabela
- Cliques nos numeros Realizado/Saldo navegam para /contratos/[id]/origem
- Pagina /origem lista NFs ou pedidos/medicoes com saldo
- Duplo-clique na origem abre rotas existentes de FAT direto / medicao
- Mantem MaximizableCard via botao dedicado (some do duplo-clique)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 15.3: Push para main**

```bash
git push -u origin main
```

- [ ] **Step 15.4: Voltar para a branch de feature**

```bash
git checkout claude/elastic-lamarr-de960d
```

- [ ] **Step 15.5: Resumo do deploy**

Reportar ao usuário:
- Hash do merge commit (`git log --oneline -1 main`)
- Lista de arquivos novos e modificados
- URL de produção esperada (https://fip-wave.vercel.app/contratos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?modo=material)

---

## Self-Review do Plano

**Spec coverage:**
- [x] Decisão 1 (árvore inline) → Tasks 9, 10, 11
- [x] Decisão 2 (gráfico sincronizado) → Task 10 (DashboardBarChart usa o array plano da árvore)
- [x] Decisão 3 (mapa de gestos) → Tasks 9, 10, 11 (linha tem onDoubleClick para expand; números têm onClick para origem; chevron via button)
- [x] Decisão 4 (rota dedicada de origem) → Tasks 5, 12
- [x] Decisão 5 (modo Total: lista junto com badge) → Task 12 (origem-table mostra coluna "Tipo")
- [x] Decisão 6 (duplo-clique na origem → rota existente) → Task 12 (origem-table.onDouble)
- [x] Decisão 7 (drill-replace eliminado) → Task 13 (handleClick removido, setFiltros aceita scope)
- [x] URL model `?modo=&scope=&expand=` → Tasks 6, 7, 11, 13
- [x] URL model `/origem?modo=&origem=&scope=&from=` → Tasks 5, 11, 12
- [x] Edge: saldo=0 ou realizado=0 não clicável → Task 8 (NumeroClicavel checa value > 0) + Task 11 (passa undefined onClickRealizado/Saldo)
- [x] Edge: modo Total + saldo desabilitado → Task 9 (DashboardTreeRow renderiza span em vez de NumeroClicavel) + Task 11 (não passa onClickSaldo em total)
- [x] Edge: notas_fiscais_wave vazia → Task 4 (try/catch em listOrigemRealizadoServico)
- [x] Edge: empty state da origem → Task 12 (origem-table renderiza "Nenhum item")
- [x] Edge: loading expansão → Task 9 (Loader2 quando isLoading)
- [x] Maximize via botão dedicado → Task 13 (mantém Maximize2)
- [x] Compat backward com `?grupo/tarefa/det=` → Task 3 (path legado preservado)

**Placeholder scan:**
- [x] Sem TBD/TODO no plano
- [x] Cada task tem código completo (JSX/TSX inteiro)
- [x] Cada step tem comando exato + expected
- [x] Tipos consistentes entre tasks (ex: `OrigemItem`, `DashboardItem`, `WbsNode` definidos uma vez e referenciados)

**Type consistency:**
- [x] `DashboardModo` usado em Task 1, 4, 5, 9, 10, 11
- [x] `OrigemTipo` usado em Tasks 1, 4, 5, 11
- [x] `OrigemItem` (union) usado em Tasks 1, 4, 5, 12
- [x] `WbsNode` definido em Task 2, usado em Task 5

Plano pronto para execução.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-drill-down-visao-geral.md`.

O usuário já delegou execução ("pode implementar da melhor forma sem fazer mais nenhuma pergunta"). Vou usar `superpowers:subagent-driven-development` (recomendado), com revisão entre tasks.
