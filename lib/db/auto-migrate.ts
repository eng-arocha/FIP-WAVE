/**
 * Auto-migration runner.
 *
 * Executado automaticamente no startup do servidor (via instrumentation.ts).
 * Mantém uma tabela `_schema_migrations` para rastrear quais arquivos já foram aplicados.
 * Só precisa de SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL nas env vars.
 */

import fs from 'fs'
import path from 'path'
import postgres from 'postgres'

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

async function getConnection(): Promise<ReturnType<typeof postgres>> {
  const { getSupabaseUrl, getSupabaseServiceRoleKey } = await import('@/lib/supabase/env')
  const url = getSupabaseUrl()
  const jwt = getSupabaseServiceRoleKey()

  if (!url || !jwt) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados')
  }

  const ref = url.replace('https://', '').replace('.supabase.co', '')

  for (const region of REGIONS) {
    try {
      const conn = postgres(buildConnString(ref, jwt, region), {
        max: 1,
        connect_timeout: 8,
        idle_timeout: 20,
      })
      await conn`SELECT 1`
      return conn
    } catch {
      // tenta próxima região
    }
  }

  throw new Error('Não foi possível conectar ao banco de dados em nenhuma região.')
}

async function ensureMigrationsTable(sql: ReturnType<typeof postgres>) {
  await sql`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

async function getApplied(sql: ReturnType<typeof postgres>): Promise<Set<string>> {
  const rows = await sql<{ version: string }[]>`
    SELECT version FROM _schema_migrations ORDER BY version
  `
  return new Set(rows.map(r => r.version))
}

function splitStatements(sql_text: string): string[] {
  // Divide no ; mas respeita blocos DO $$ ... $$
  const stmts: string[] = []
  let current = ''
  let inDollar = false

  for (const line of sql_text.split('\n')) {
    const trimmed = line.trim()

    // Detecta início/fim de bloco $$ (PL/pgSQL)
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

  // Qualquer sobra sem ponto-e-vírgula final
  const leftover = current.trim()
  if (leftover.length > 3 && !leftover.startsWith('--')) {
    stmts.push(leftover)
  }

  return stmts
}

export async function runMigrations(): Promise<void> {
  // Localiza o diretório de migrations relativo a este arquivo
  // Em Vercel, __dirname aponta para .next/server/...
  // Tentamos múltiplos caminhos
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

  let sql: ReturnType<typeof postgres> | null = null
  try {
    sql = await getConnection()
    await ensureMigrationsTable(sql)
    const applied = await getApplied(sql)

    let ran = 0
    for (const file of files) {
      const version = file.replace('.sql', '')
      if (applied.has(version)) continue

      console.log(`[auto-migrate] Aplicando: ${file}`)
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      const stmts = splitStatements(content)

      for (const stmt of stmts) {
        try {
          await sql.unsafe(stmt)
        } catch (e: any) {
          // Ignora erros de "já existe" (idempotência)
          if (
            e.message?.includes('already exists') ||
            e.message?.includes('já existe') ||
            e.code === '42P07' || // duplicate table
            e.code === '42701'    // duplicate column
          ) {
            // ok, continua
          } else {
            console.error(`[auto-migrate] ERRO em ${file}: ${e.message}`)
            // Não interrompe — registra e segue para não bloquear o boot
          }
        }
      }

      await sql`
        INSERT INTO _schema_migrations (version) VALUES (${version})
        ON CONFLICT (version) DO NOTHING
      `
      ran++
      console.log(`[auto-migrate] ✓ ${file}`)
    }

    if (ran === 0) {
      console.log('[auto-migrate] Banco já está atualizado.')
    } else {
      console.log(`[auto-migrate] ${ran} migration(s) aplicada(s).`)
    }
  } catch (e: any) {
    console.error('[auto-migrate] Falha na conexão ou execução:', e.message)
  } finally {
    await sql?.end()
  }
}
