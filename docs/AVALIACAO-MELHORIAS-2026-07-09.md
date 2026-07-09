# Avaliação do FIP-WAVE + Plano de Melhorias — 2026-07-09

Avaliação feita com o app em estado: **typecheck limpo, build de produção OK, 63/63 testes passando**.
Números levantados: 281 arquivos TS/TSX, 123 route handlers de API, ~1.300 apontamentos de lint
(1.157 são `any` explícito), 6 páginas com mais de 1.000 linhas.

## 1. O que foi corrigido NESTA branch (P0 — segurança e correção)

### 1.1 Autorização nas rotas de mutação da API
**Problema:** dos 123 route handlers, só 46 verificavam permissão. Endpoints como
`POST /api/contratos`, `PATCH /api/empresas/[id]`, `POST /api/contratos/[id]/medicoes`,
upload de orçamento, aditivos, detalhamentos e solicitações de fat-direto exigiam apenas
**estar logado** — qualquer usuário `visualizador` podia criar/editar/apagar via `fetch`
direto, porque as rotas usam o client service-role (bypassa RLS) e a checagem de perfil
ficava só na UI.

**Correção:** novos guards em `lib/api/auth.ts` (`requirePermissao`, `requireAlgumaPermissao`,
`requireAdmin`) aplicados a **35 rotas de mutação**, usando o vocabulário de permissões que
já existia (`contratos.criar/editar`, `empresas.criar/editar`, `medicoes.criar/editar`,
`documentos.criar`, `nf_fat_direto.lancar`, `aprovacoes.aprovar`). Admin mantém bypass total,
então o fluxo do gestor não muda. Rotas GET não foram tocadas (todos os templates têm
`visualizar`), zero risco de quebrar leitura.

### 1.2 Rotas one-shot `/api/admin/*` abertas
**Problema:** `run-migration-062/064`, `auto-aprovar-rascunhos-medicao`, `setar-datas-contrato`,
`aplicar-retencao-final`, `limpar-orfaos-orcamento`, `reload-schema-cache`,
`ajustar-pedido-wave-liquido`, `diag-aprovacao` eram executáveis por **qualquer usuário logado**
(rodavam migrations e auto-aprovavam medições!).

**Correção:** todas agora exigem perfil `admin` (403 caso contrário).

### 1.3 Crons do Vercel nunca executavam
**Problema:** `vercel.json` agenda `/api/cron/notificacoes-retry` e `/api/cron/webhooks-retry`
diariamente, mas o Vercel Cron chama sem cookie de sessão → o proxy redirecionava para
`/login` **antes** do handler validar o `Bearer CRON_SECRET`. Ou seja: os retries de
notificação/webhook nunca rodaram de fato (o redirect 200 mascarava a falha no painel do Vercel).

**Correção:** o proxy libera esses dois caminhos (o handler continua validando o secret) e os
handlers ficaram **fail-closed** em produção: sem `CRON_SECRET` configurado respondem 503 em vez
de processar sem autenticação.

> ⚠️ **Ação necessária:** definir `CRON_SECRET` nas Environment Variables do Vercel
> (qualquer string longa aleatória). O Vercel envia automaticamente
> `Authorization: Bearer <CRON_SECRET>` nas chamadas de cron.

### 1.4 `/api/*` sem sessão devolvia HTML
**Problema:** chamada de API com sessão expirada recebia 307 → `/login` (HTML). O client fazia
`res.json()` e estourava com erro confuso (`Unexpected token '<'`).

**Correção:** o proxy agora responde `401 {"error":"Não autenticado"}` para `/api/*` sem sessão.

### 1.5 Higiene de lint
`prefer-const` (6), diretivas `eslint-disable` mortas (11) e limpeza do resíduo do autofix.

## 2. Plano de melhorias — P1 (recomendado como próximo passo)

### 2.1 Tipagem do Supabase (ataca as 1.157 ocorrências de `any`)
- Gerar tipos do schema: `npx supabase gen types typescript` → `types/supabase.ts` e tipar
  `createAdminClient()`/`createClient()` com `SupabaseClient<Database>`.
- Efeito cascata: a maioria dos `any` em `lib/db/*` e nas rotas desaparece ou vira erro útil.
- Esforço: ~1 dia; risco baixo (só tipos, sem mudança de runtime).

### 2.2 Quebrar as páginas-monólito
| Página | Linhas | Sugestão |
|---|---|---|
| `app/(app)/nf-fat-direto/page.tsx` | 2.055 | extrair modal de lançamento, tabela e filtros |
| `.../medicoes/[medicaoId]/informacon/page.tsx` | 1.718 | extrair seções em componentes |
| `.../medicoes/[medicaoId]/page.tsx` | 1.682 | extrair grade de pavimentos/vãos e header |
| `app/(app)/aprovacoes/page.tsx` | 1.438 | extrair cards por tipo de aprovação |
| `.../fat-direto/[solId]/page.tsx` | 1.489 | extrair painel de NFs |

Ganhos: re-render menor, revisão mais fácil, menos bugs de estado. Fazer 1 página por vez.

### 2.3 Data fetching com cache (SWR ou React Query)
Hoje cada página faz `fetch` manual em `useEffect` com estados `loading/erro` duplicados
(e os 14 warnings de `exhaustive-deps` vêm daí). Adotar SWR nas telas mais visitadas
(dashboard, lista de contratos, medições) dá: cache entre navegações, revalidação automática,
deduplicação e elimina a classe inteira de bugs de dependência.

### 2.4 RLS como defesa em profundidade
Quase todas as rotas usam o client **service-role**. Se uma rota esquecer o guard, não há
segunda barreira. Recomendação: habilitar RLS nas tabelas principais com policies simples
(`authenticated` pode `select`; mutações só via service-role) — protege contra uso indevido
da anon key e contra rotas futuras sem guard.

## 3. Plano de melhorias — P2

- **Testes de autorização:** teste de integração que percorre as rotas de mutação e garante
  403 para perfil `visualizador` (evita regressão do item 1.1).
- **Rate limiting:** `lib/api/rate-limit.ts` existe mas só é usado em `/api/cnpj`. Aplicar em
  `alterar-senha` e nos uploads.
- **Padronizar erro no client:** helper `fetchJson()` que lança com a mensagem do servidor
  (`{error}`) e toast padrão — hoje cada página trata (ou ignora) de um jeito.
- **Remover one-shots já executados:** `setar-datas-contrato` (UUID hardcoded),
  `run-migration-062/064`, `aplicar-retencao-final` etc. já cumpriram o papel; apagar as rotas
  reduz superfície de ataque e ruído.
- **Adotar paginação na UI:** `GET /api/contratos` tem modo keyset (`?limit=`) mas a UI ainda
  usa o modo legado que traz tudo — migrar as listas grandes.
- **`react/no-unescaped-entities` (12) e `no-unused-vars` (72):** limpeza incremental.

## 4. Plano de melhorias — P3 (quando houver folga)

- **Acessibilidade:** revisar `aria-*` nos componentes de tabela/modal, foco pós-navegação.
- **Auditoria:** `lib/api/audit.ts` existe; cobrir também criação/edição de contratos e empresas.
- **`SCREENSHOTS_MODE`:** o bypass de auth do proxy é útil em dev, mas vale um guard extra
  (`NODE_ENV !== 'production'`) para nunca valer em produção.
- **Observabilidade:** Sentry já configurado; adicionar `Sentry.captureException` no `apiError()`
  para erros 500 de API aparecerem com contexto de rota.

## 5. Como validar as mudanças desta branch

1. **Admin (seu perfil):** nada muda — admin tem bypass em todos os guards.
2. **Perfil visualizador:** tentar criar contrato/empresa/medição → deve receber 403 com
   mensagem clara (antes: criava!).
3. **Crons:** definir `CRON_SECRET` no Vercel → aba Crons deve mostrar execuções 200.
4. **Sessão expirada:** chamadas de API devolvem 401 JSON e a UI mostra erro em vez de
   estourar parse de HTML.
