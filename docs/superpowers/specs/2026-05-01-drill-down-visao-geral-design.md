# Drill-down Navegável na Visão Geral do Contrato

**Data:** 2026-05-01
**Branch:** claude/elastic-lamarr-de960d
**Status:** Aprovado pelo usuário (carta branca para implementação)

## Contexto

Hoje a página `/contratos/[id]?modo=material|servico|total` tem um card "Visão Geral" com gráfico Recharts (BarChart) + tabela customizada. As interações atuais:

- **Clique simples** numa linha/barra: faz drill-down hierárquico substituindo o nível visualizado (URL: `?grupo=&tarefa=&det=`).
- **Duplo-clique** em qualquer ponto do card (não-interativo): maximiza o card via `MaximizableCard`.
- Maximizar também tem um botão dedicado `Maximize2` (`onClick={() => setFullscreenChart('bar')}`).

**Problema:** o duplo-clique para fullscreen é um gesto valioso desperdiçado. O usuário quer reaproveitá-lo para navegação profunda nos dados, transformando o dashboard em ferramenta exploratória — do nível agregado até a nota fiscal individual e daí até o pedido/medição de origem.

## Objetivo

Permitir navegação contínua "topo → fundo" no dashboard:

1. **Visão Geral** vira árvore inline expansível: cada duplo-clique abre os filhos do nó.
2. **Cliques nos números** (Realizado / Saldo) levam a uma nova página de origem, listando as notas ou pedidos/medições que compõem aquele valor.
3. **Duplo-clique nas linhas da página de origem** leva às rotas de detalhe já existentes (`/fat-direto/[id]` ou `/medicoes/[id]`).

O resultado é um caminho navegável de 3 níveis: Visão Geral (agregado) → Origem (notas/pedidos) → Detalhe (entidade individual).

## Decisões de UX (validadas)

| # | Decisão | Escolha |
|---|--------|--------|
| 1 | Comportamento de duplo-clique na Visão Geral | Árvore inline expansível (pai continua visível, filhos indentados embaixo) |
| 2 | Gráfico vs tabela durante expansão | Sincronizado linha-a-linha (mesmas barras, indentação visual no gráfico) |
| 3 | Mapa de gestos | Tabela única no design, ver seção "Mapa de gestos" |
| 4 | Página de origem | Rota dedicada `/contratos/[id]/origem`, tabela única com filtros básicos |
| 5 | Modo Total | Lista NFs FAT direto + Wave juntas, com badge de tipo |
| 6 | Drill da página de origem | Duplo-clique numa linha → rota existente do pedido/medição |
| 7 | Drill-replace atual (clique simples muda nível) | **Eliminado** — toda navegação hierárquica vira expansão da árvore |

## Mapa de gestos final

| Onde | Gesto | Efeito |
|------|------|--------|
| Linha da tabela (área nome/código) | 1× clique | Destaca linha + barra correspondente no gráfico |
| Linha da tabela | 2× clique | Expande/colapsa filhos imediatos |
| Barra do gráfico (qualquer ponto) | 2× clique | Equivale a duplo-clique na linha |
| Chevron (▶ / ▼) | 1× clique | Atalho ergonômico para expandir/colapsar |
| Número "Realizado" da tabela | 1× clique | Navega para `/origem?origem=realizado` |
| Segmento "Realizado" da barra | 1× clique | Equivale ao número Realizado |
| Número "Saldo aprovado / Saldo medição" | 1× clique | Navega para `/origem?origem=saldo` (apenas modo material/servico) |
| Segmento "Saldo" da barra | 1× clique | Equivalente ao número Saldo |
| Número "Contratado" | — | Sem ação (referência); tooltip explica fórmula |
| Botão Maximize (⛶) | 1× clique | Mantém fullscreen (ícone dedicado, deixa de ser duplo-clique) |

**Tratamento de números zerados:** quando Realizado = 0 ou Saldo = 0, o número não é clicável (cursor padrão, sem hover effect, sem navegação). Em modo Total não há clique no Saldo (semântica ambígua de saldo total) — apenas Realizado é clicável.

## Modelo de URL

### Visão Geral
```
/contratos/[id]?modo=material&scope=<id-do-no-raiz>&expand=<csv-de-ids>
```
- `modo` (`total|material|servico`): mantido.
- `scope`: ID do nó que é a raiz da árvore. Ausente ou `null` = todos os grupos macro (nível 1).
- `expand`: CSV de IDs de nós abertos (ex: `g1,t1.3`).

Os 3 Selects de filtro (Grupo / Tarefa / Detalhamento) **continuam existindo** mas passam a setar `scope` em vez de fazer drill-replace.

### Página de origem
```
/contratos/[id]/origem?modo=material&origem=realizado&scope=<id>&from=<encoded>
```
- `modo` (`total|material|servico`): determina o cálculo.
- `origem` (`realizado|saldo`): determina o tipo de listagem.
- `scope`: nó da WBS que delimita o conjunto (default = todos).
- `from` (opcional): URL completa da Visão Geral de origem, encodada — usada pelo botão "Voltar" para preservar o `expand` original.

## Componentes (novos)

```
components/contratos/visao-geral/
  dashboard-tree.tsx         # orquestrador: estado de expansão + carregamento sob demanda
  dashboard-tree-row.tsx     # linha da tabela (chevron, indent, números clicáveis)
  dashboard-bar-chart.tsx    # gráfico Recharts custom (barras com indent visual)
  numero-clicavel.tsx        # célula numérica com cursor pointer + onClick
  index.ts

app/(app)/contratos/[id]/origem/
  page.tsx                   # rota dedicada da página de origem
  origem-table.tsx           # tabela única (NFs ou pedidos/medições)
  origem-summary.tsx         # cards de resumo no topo (total, contagem, status)

lib/hooks/
  use-tree-expansion.ts      # Set<string> de IDs expandidos sincronizado com URL
  use-dashboard-tree-data.ts # cache + fetch sob demanda dos filhos
```

## API e backend

### Endpoint existente (modificado)
**`GET /api/contratos/[id]/dashboard?modo=...&scope=<id|null>`**

Comportamento:
- Sem `scope` (ou `scope=null`): retorna nível 1 (todos os grupos macro).
- Com `scope=<id>`: retorna **filhos diretos do nó** (1 nível abaixo).
- Mantém compatibilidade temporária com `?grupo=&tarefa=&det=` durante migração.

### Endpoint novo
**`GET /api/contratos/[id]/origem?modo=...&origem=realizado|saldo&scope=<id|null>`**

Retorna:
```ts
type OrigemResponse = {
  total: number              // soma do conjunto
  count: number              // quantidade de itens
  itens: OrigemItem[]
  resumoStatus?: { validadas?: number; pendentes?: number; rejeitadas?: number }
  scope: { id: string | null; codigo: string; nome: string } | null
  modo: 'total' | 'material' | 'servico'
  origem: 'realizado' | 'saldo'
}

type OrigemItem =
  | { tipo: 'nf-fat-direto'; id: string; numero: string; data: string; valor: number; status: string; pedidoId: string; pedidoNumero: string }
  | { tipo: 'nf-wave';       id: string; numero: string; data: string; valor: number; status: string; medicaoId: string; medicaoNumero: string }
  | { tipo: 'pedido-saldo';  id: string; numero: string; aprovadoEm: string; aprovado: number; emNF: number; saldo: number }
  | { tipo: 'medicao-saldo'; id: string; numero: string; aprovadoEm: string; aprovado: number; emNF: number; saldo: number }
```

### Lógica de cálculo
Reusa `lib/db/dashboard.ts` (cálculos de realizado e saldo já existem). Extrair em `lib/db/origem.ts`:

- `listNotasRealizadoMaterial(contratoId, scope)`: NFs FAT direto vinculadas a pedidos cujos itens caem no `scope`. Cada NF é alocada proporcionalmente conforme já feito no dashboard (linhas 178-238 de dashboard.ts).
- `listNotasRealizadoServico(contratoId, scope)`: NFs Wave vinculadas a medições cujos itens caem no `scope`.
- `listSaldoMaterial(contratoId, scope)`: pedidos FAT direto aprovados com saldo > 0 que tocam o `scope`.
- `listSaldoServico(contratoId, scope)`: medições aprovadas com saldo > 0 que tocam o `scope`.
- `listOrigemTotal(contratoId, scope, origem)`: união dos dois tipos para modo `total`.

A função de "tocar o scope" navega a hierarquia: dado um `scope` (grupo, tarefa, ou detalhamento), expande para todos os detalhamentos descendentes e filtra os itens cujos `detalhamento_id` (ou `tarefa_id` em casos legados) caem no conjunto.

## Edge cases

| Situação | Tratamento |
|---------|----------|
| Saldo = 0 ou Realizado = 0 | Número não clicável (cursor padrão) |
| Modo Total, clique em "Saldo" | Desabilitado — só Realizado funciona |
| Tabela `notas_fiscais_wave` vazia | Saldo medição = realizado serviço (já tratado em dashboard.ts via try/catch) |
| Empty state da página origem | Card centralizado: "Nenhuma nota lançada para este escopo" + link "Voltar à Visão Geral" |
| Loading expansão | Skeleton inline nas linhas pendentes; spinner substituindo o chevron do nó pai |
| Mobile (< 768px) | Tabela árvore + gráfico empilham verticalmente; tabela com scroll horizontal |
| Item sem filhos (nivel 3) | Sem chevron; duplo-clique não tem efeito; números seguem clicáveis |
| Nó já expandido na URL mas sem filhos no servidor | Remove silenciosamente do `expand` ao reconciliar |
| Tabela muito grande (>100 nós abertos) | Mantém renderização (sem virtualização nesta entrega; flag para futuro) |

## Acessibilidade

- **Teclado:**
  - `↑ / ↓` navegam entre linhas focáveis
  - `← / →` colapsam / expandem o nó focado
  - `Enter` no nome → expande (alternativa ao duplo-clique)
  - `Enter` no número Realizado/Saldo → navega para origem
  - `Esc` fecha modo maximizado
- **ARIA:**
  - Tabela: `role="tree"`, cada linha `role="treeitem"` com `aria-level`, `aria-expanded`, `aria-setsize`, `aria-posinset`
  - Números clicáveis: `<button>` semântico com `aria-label` descritivo
- **Foco visível:** anel de foco em todas as áreas interativas
- **Detecção click vs double-click:** comparar timestamp do último click (threshold 250ms) — sem `setTimeout` (evita lag perceptível no clique simples)

## Performance

- **Lazy loading:** filhos carregados sob demanda; cache em `Map<scopeId, DashboardItem[]>` no client (via `useRef`).
- **Memoização:** `React.memo` em `DashboardTreeRow`, `useMemo` em transformações pesadas.
- **Recharts:** uma única `<BarChart>` recebe array plano da árvore visível; sem rerender total ao expandir.
- **URL update:** `router.replace({ scroll: false })` para mudanças de `expand`.
- **Debounce não é necessário:** click vs double-click resolvido por comparação de timestamp.

## Migração (sem regressão)

- A API atual aceita ambos: `?scope=<id>` (novo) e `?grupo=&tarefa=&det=` (legado, deprecation warning no console no dev).
- Após o componente novo entrar em produção, remover o suporte legado em PR posterior.
- Componente `MaximizableCard` permanece — apenas o gatilho `onDoubleClick` interno é desabilitado dentro do escopo da tabela e do gráfico (via `data-no-maximize` nos containers ou desabilitando o handler quando o card pai é o da Visão Geral).

## Telemetria (opcional, fora do escopo)

- Sentry continua só capturando erros.
- Considerar tracking de eventos (`drill-down expand`, `origem visit`) em PR futuro com PostHog ou similar.

## Layout da página de origem

```
┌─────────────────────────────────────────────────────────────────┐
│ Topbar                                                            │
├─────────────────────────────────────────────────────────────────┤
│ ← Voltar à Visão Geral                                            │
│ Breadcrumb: Contrato › Visão Geral › Grupo 1 › 1.3 › Realizado   │
│                                                                   │
│ ┌─ Resumo ─────────────────────────────────────────────────────┐│
│ │ 200.000 total · 12 notas de 4 pedidos · 8 validadas · 4 pend ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                   │
│ [Todas] [Validadas] [Pendentes]              🔍 Buscar...        │
│                                                                   │
│ ┌─ Tabela ────────────────────────────────────────────────────┐│
│ │ NF      Data     Pedido      Valor alocado   Status          ││
│ │ 38421   02/04   FD-2024-018  52.000          ● validada      ││
│ │ ...                                                          ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                   │
│ Duplo-clique numa linha → abre o pedido/medição                  │
└─────────────────────────────────────────────────────────────────┘
```

## Visão Geral (depois da reforma)

```
┌─ Visão Geral ────────────────────────────────────────── ⛶ ───┐
│                                                                │
│ Filtros: [Grupo: Todos ▾] [Tarefa: ▾] [Detalham: ▾] [Modo ▾] │
│                                                                │
│ ┌─ Gráfico ──────────────┐  ┌─ Tabela ──────────────────────┐│
│ │ ▼ G1 ████████ 1.250k   │  │ ▼ Grupo 1     1250k  720k 410k││
│ │  └ 1.1 ██ 320k         │  │   ▶ 1.1        320k  200k  90k││
│ │  └ 1.2 ███ 510k        │  │   ▶ 1.2        510k  320k 180k││
│ │  └ 1.3 ██ 420k         │  │   ▼ 1.3        420k  200k 140k││
│ │     └ 1.3.1 █ 200k     │  │     ▷ 1.3.1    200k  120k  60k││
│ │     └ 1.3.2 █ 220k     │  │     ▷ 1.3.2    220k   80k  80k││
│ │ ▶ G2 ███████ 800k      │  │   ▶ Grupo 2    800k  410k 200k││
│ │ ▶ G3 ████████ 950k     │  │   ▶ Grupo 3    950k  380k 240k││
│ └────────────────────────┘  └───────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘

Legenda de gestos:
  • 1× linha/barra → destaca
  • 2× linha/barra → expande/colapsa
  • 1× chevron     → atalho expandir/colapsar
  • 1× número Realizado / Saldo → /origem
  • 1× ⛶ → maximize
```

## Critérios de pronto

1. Visão Geral renderiza como árvore inline; expand/colapse funciona via duplo-clique e chevron.
2. Gráfico sincronizado linha-a-linha com a tabela; barras indentadas visualmente.
3. URL preserva estado de expansão e modo; recarregar a página restaura tudo.
4. Clique nos números Realizado/Saldo (e segmentos correspondentes da barra) navega para `/origem?...`.
5. Página `/origem` lista NFs (origem=realizado) ou pedidos/medições com saldo (origem=saldo) com filtros básicos.
6. Duplo-clique na linha da página de origem abre `/fat-direto/[id]` ou `/medicoes/[id]`.
7. Maximize fullscreen continua funcionando via botão dedicado, não via duplo-clique.
8. Regressão zero nas demais abas e fluxos do contrato.
9. Acessibilidade: navegação por teclado funcional, ARIA correto, foco visível.
10. Sem erros TypeScript, build passa, sem warnings de console no fluxo principal.

## Fora de escopo (PRs futuros)

- Virtualização da árvore (caso > 200 nós abertos simultaneamente).
- Telemetria de drill-down (PostHog).
- Exportar a tabela de origem para PDF/Excel.
- "Pin" de nós favoritos para expansão padrão.
- Compartilhar URL com expansão pré-resolvida no servidor (SSR amigável).
