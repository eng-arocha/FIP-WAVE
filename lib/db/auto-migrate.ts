/**
 * Auto-migration runner.
 *
 * Executado automaticamente no startup do servidor (via instrumentation.ts).
 * Mantém uma tabela `_schema_migrations` para rastrear quais arquivos já foram aplicados.
 * Só precisa de SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL nas env vars.
 *
 * Estratégia em duas camadas:
 *   1. Tenta conexão TCP direta com o pooler do Supabase (postgres.js).
 *      Funciona localmente. Em Vercel Functions é frequentemente bloqueado.
 *   2. Se a camada 1 falhar em TODAS as regiões, faz fallback via PostgREST
 *      RPC `public.exec_sql(p_sql text)` (criada pela migration 058 — precisa
 *      ser aplicada uma vez manualmente no SQL Editor pra desbloquear o
 *      fallback).
 *
 * Erros que NÃO sejam idempotência (já existe / coluna duplicada) são
 * propagados — assim o instrumentation.register() falha e o problema fica
 * visível no log do Vercel (em vez de ser silenciado por console.error e
 * passar despercebido por dias).
 */

import fs from 'fs'
import path from 'path'
import postgres from 'postgres'
import type { SupabaseClient } from '@supabase/supabase-js'

const REGIONS = [
  'us-east-1',
  'sa-east-1',
  'eu-west-1',
  'ap-southeast-1',
  'us-west-1',
]

function buildConnString(projectRef: string, jwt: string, region: string) {
  return `postgresql://postgres.${projectRef}:${jwt}@aws-0-${region}.pooler.supabase.com:5432/postgres`
}

export async function getConnection(): Promise<ReturnType<typeof postgres>> {
  const { getSupabaseUrl, getSupabaseServiceRoleKey } = await import('@/lib/supabase/env')
  const url = getSupabaseUrl()
  const jwt = getSupabaseServiceRoleKey()

  if (!url || !jwt) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados')
  }

  const ref = url.replace('https://', '').replace('.supabase.co', '')

  const errors: string[] = []
  for (const region of REGIONS) {
    try {
      const conn = postgres(buildConnString(ref, jwt, region), {
        max: 1,
        connect_timeout: 8,
        idle_timeout: 20,
      })
      await conn`SELECT 1`
      return conn
    } catch (e: any) {
      errors.push(`${region}: ${e?.message ?? e}`)
    }
  }

  throw new Error(
    `Não foi possível conectar ao banco em nenhuma região. Detalhes: ${errors.join(' | ')}`,
  )
}

function isIdempotent(e: any): boolean {
  return Boolean(
    e?.message?.includes('already exists') ||
      e?.message?.includes('já existe') ||
      e?.code === '42P07' || // duplicate table
      e?.code === '42701' || // duplicate column
      // Erros via PostgREST RPC vêm com strings dentro de e.message
      e?.message?.includes('42P07') ||
      e?.message?.includes('42701'),
  )
}

function splitStatements(sql_text: string): string[] {
  // Divide no ; mas respeita blocos $$ ... $$ (PL/pgSQL)
  const stmts: string[] = []
  let current = ''
  let inDollar = false

  for (const line of sql_text.split('\n')) {
    const trimmed = line.trim()

    const dollarCount = (line.match(/\$\$/g) || []).length
    if (dollarCount % 2 !== 0) inDollar = !inDollar

    current += line + '\n'

    if (!inDollar && trimmed.endsWith(';')) {
      const stmt = current.trim()
      if (stmt.length > 3 && !stmt.startsWith('--')) {
        stmts.push(stmt)
      }
      current = ''
    }
  }

  const leftover = current.trim()
  if (leftover.length > 3 && !leftover.startsWith('--')) {
    stmts.push(leftover)
  }

  return stmts
}

// =====================================================================
// Runner: abstração que aplica statements e rastreia migrations.
// =====================================================================

interface MigrationRunner {
  readonly mode: 'postgres' | 'rpc'
  ensureMigrationsTable(): Promise<void>
  getApplied(): Promise<Set<string>>
  runStatement(stmt: string): Promise<void>
  recordApplied(version: string): Promise<void>
  close(): Promise<void>
}

class PostgresRunner implements MigrationRunner {
  readonly mode = 'postgres' as const
  constructor(private sql: ReturnType<typeof postgres>) {}

  async ensureMigrationsTable(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
  }

  async getApplied(): Promise<Set<string>> {
    const rows = await this.sql<{ version: string }[]>`
      SELECT version FROM _schema_migrations ORDER BY version
    `
    return new Set(rows.map(r => r.version))
  }

  async runStatement(stmt: string): Promise<void> {
    await this.sql.unsafe(stmt)
  }

  async recordApplied(version: string): Promise<void> {
    await this.sql`
      INSERT INTO _schema_migrations (version) VALUES (${version})
      ON CONFLICT (version) DO NOTHING
    `
  }

  async close(): Promise<void> {
    await this.sql.end()
  }
}

class RpcRunner implements MigrationRunner {
  readonly mode = 'rpc' as const
  constructor(private sb: SupabaseClient) {}

  private async exec(sql: string): Promise<void> {
    const { error } = await this.sb.rpc('exec_sql', { p_sql: sql })
    if (error) {
      const err = new Error(`exec_sql RPC: ${error.message}`)
      ;(err as any).code = (error as any).code ?? null
      ;(err as any).details = (error as any).details ?? null
      throw err
    }
  }

  async ensureMigrationsTable(): Promise<void> {
    await this.exec(`
      CREATE TABLE IF NOT EXISTS public._schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    // Garante que o PostgREST releia o schema cache (caso a tabela tenha
    // sido criada agora). Sem isso, o .from('_schema_migrations') abaixo
    // pode dar PGRST205 até o próximo reload automático.
    try {
      await this.exec(`NOTIFY pgrst, 'reload schema'`)
    } catch {
      // Não é crítico — segue o jogo.
    }
  }

  async getApplied(): Promise<Set<string>> {
    const { data, error } = await this.sb
      .from('_schema_migrations')
      .select('version')
    if (error) {
      // Cache miss ou tabela ainda não exposta: assume vazio. As próprias
      // migrations devem ser idempotentes pra esse caso (CREATE TABLE IF
      // NOT EXISTS, ADD COLUMN IF NOT EXISTS, etc.).
      console.warn(
        `[auto-migrate/rpc] Não foi possível ler _schema_migrations via PostgREST (${error.message}). ` +
          `Assumindo lista vazia — confiando em idempotência.`,
      )
      return new Set()
    }
    return new Set((data ?? []).map((r: any) => String(r.version)))
  }

  async runStatement(stmt: string): Promise<void> {
    await this.exec(stmt)
  }

  async recordApplied(version: string): Promise<void> {
    // version vem de filename .sql (chars seguros), mas escapamos por
    // garantia.
    const safe = version.replace(/'/g, "''")
    await this.exec(
      `INSERT INTO public._schema_migrations (version) VALUES ('${safe}') ON CONFLICT (version) DO NOTHING`,
    )
  }

  async close(): Promise<void> {
    // supabase-js não mantém conexões persistentes — nada a fechar.
  }
}

async function buildRunner(): Promise<MigrationRunner> {
  // 1. Tenta postgres direto.
  try {
    const sql = await getConnection()
    console.log('[auto-migrate] Conectado via postgres direto.')
    return new PostgresRunner(sql)
  } catch (e: any) {
    console.warn(
      `[auto-migrate] Conexão postgres direta falhou: ${e?.message ?? e}. ` +
        `Tentando fallback via PostgREST RPC (exec_sql)…`,
    )
  }

  // 2. Fallback: supabase-js + RPC exec_sql (precisa da migration 058
  // aplicada manualmente).
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const sb = createAdminClient()

  // Smoke test: confirma que a função existe. Se não existir, dá erro
  // claro mencionando a 058.
  const { error } = await sb.rpc('exec_sql', { p_sql: 'SELECT 1' })
  if (error) {
    const message = String(error.message ?? '')
    if (
      message.includes('exec_sql') &&
      (message.includes('does not exist') || message.includes('not found') || message.includes('PGRST202'))
    ) {
      throw new Error(
        `[auto-migrate] Fallback RPC indisponível: função public.exec_sql(text) não existe no banco. ` +
          `Aplique a migration 058_exec_sql_rpc.sql manualmente no SQL Editor do Supabase pra habilitar o fallback. ` +
          `Erro original: ${message}`,
      )
    }
    throw new Error(`[auto-migrate] Smoke test do fallback RPC falhou: ${message}`)
  }

  console.log('[auto-migrate] Conectado via PostgREST RPC (fallback).')
  return new RpcRunner(sb)
}

// =====================================================================
// Execução principal.
// =====================================================================

export async function runMigrations(): Promise<void> {
  const candidates = [
    path.join(process.cwd(), 'supabase', 'migrations'),
    path.join(__dirname, '..', '..', 'supabase', 'migrations'),
    path.join(__dirname, '..', '..', '..', 'supabase', 'migrations'),
  ]

  let migrationsDir = ''
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      migrationsDir = c
      break
    }
  }

  if (!migrationsDir) {
    console.warn('[auto-migrate] Diretório de migrations não encontrado. Pulando.')
    return
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.log('[auto-migrate] Nenhum arquivo de migration encontrado.')
    return
  }

  let runner: MigrationRunner | null = null
  try {
    runner = await buildRunner()
    await runner.ensureMigrationsTable()
    const applied = await runner.getApplied()

    let ran = 0
    let firstError: Error | null = null

    for (const file of files) {
      const version = file.replace('.sql', '')
      if (applied.has(version)) continue

      console.log(`[auto-migrate] Aplicando (${runner.mode}): ${file}`)
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      const stmts = splitStatements(content)

      let hadFatal = false
      for (const stmt of stmts) {
        try {
          await runner.runStatement(stmt)
        } catch (e: any) {
          if (isIdempotent(e)) {
            // Idempotência: ignora silenciosamente.
            continue
          }
          hadFatal = true
          console.error(`[auto-migrate] ERRO em ${file}: ${e?.message ?? e}`)
          if (!firstError) {
            firstError = new Error(
              `[auto-migrate] Falha aplicando ${file}: ${e?.message ?? e}`,
            )
          }
          // Não interrompe o loop: tenta os próximos statements e migrations
          // pra coletar o máximo de info no log antes de re-lançar.
        }
      }

      if (!hadFatal) {
        await runner.recordApplied(version)
        ran++
        console.log(`[auto-migrate] ✓ ${file}`)
      } else {
        console.error(
          `[auto-migrate] ✗ ${file} aplicada parcialmente — NÃO marcando como concluída.`,
        )
      }
    }

    if (ran === 0) {
      console.log('[auto-migrate] Banco já está atualizado.')
    } else {
      console.log(`[auto-migrate] ${ran} migration(s) aplicada(s) (${runner.mode}).`)
    }

    if (firstError) {
      // Fail loud — instrumentation.register() vai propagar isso e o
      // erro aparece como crash visível no log do Vercel.
      throw firstError
    }
  } finally {
    await runner?.close()
  }
}
