# FIP-WAVE · Sistema de Controle de Medições

Sistema web para controle de medições e faturamento de contratos de obras — multi-contrato, expansível.

## Funcionalidades

- **Multi-contrato** — N contratos, N empresas, expansível para qualquer obra
- **Tipos de Contrato** — Global, Preço Unitário, % Serviço/Faturamento Direto
- **Aditivos** — valor, prazo, escopo ou misto, com histórico
- **Estrutura Hierárquica** — Grupos Macro → Tarefas → Detalhamentos (3 níveis)
- **Fluxo de Medição em 4 passos** — dados, itens, anexos/NFs, revisão
- **Workflow de Aprovação** — aprovar/rejeitar com comentários e timeline
- **E-mails Automáticos** — notificações via Resend com cópia para todas as partes
- **Dashboard** — KPIs, Curva S, avanço financeiro x físico por grupo macro
- **Gestão de Empresas** — contratantes e contratados

## Stack

- **Next.js 15** + TypeScript + Tailwind CSS
- **Supabase** — PostgreSQL + Auth + Storage
- **Resend** — e-mails transacionais
- **Recharts** — gráficos e Curva S

## Setup Rápido

```bash
cp .env.example .env.local   # configure Supabase + Resend
npm install
npm run dev                   # http://localhost:3000
```

Execute `supabase/migrations/001_initial_schema.sql` no Supabase Studio para criar o banco.

## Estrutura

```
app/(app)/dashboard          # Dashboard geral
app/(app)/contratos          # Lista e cadastro
app/(app)/contratos/[id]     # Detalhe (tabs: visão geral, medições, estrutura, aditivos)
app/(app)/contratos/[id]/estrutura    # Grupos > Tarefas > Detalhamentos
app/(app)/contratos/[id]/medicoes     # Nova medição (wizard 4 passos)
app/(app)/contratos/[id]/aditivos     # Aditivos contratuais
app/(app)/aprovacoes         # Fila de aprovações + histórico
app/(app)/empresas           # Gestão de empresas
supabase/migrations/         # Schema PostgreSQL completo
```
