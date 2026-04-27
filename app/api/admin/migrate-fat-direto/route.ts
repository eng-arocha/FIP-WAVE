import { NextResponse } from 'next/server'
import postgres from 'postgres'
import { apiError } from '@/lib/api/error-response'
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '@/lib/supabase/env'

const MIGRATION_SQL = `
-- Tabela principal de solicitações fat direto
CREATE TABLE IF NOT EXISTS solicitacoes_fat_direto (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id               UUID NOT NULL REFERENCES contratos(id),
  numero                    SERIAL,
  status                    TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aguardando_aprovacao','aprovado','rejeitado','cancelado')),
  solicitante_id            UUID REFERENCES perfis(id),
  aprovador_id              UUID REFERENCES perfis(id),
  data_solicitacao          TIMESTAMPTZ DEFAULT NOW(),
  data_aprovacao            TIMESTAMPTZ,
  observacoes               TEXT,
  motivo_rejeicao           TEXT,
  valor_total               NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS fornecedor_razao_social      TEXT,
  ADD COLUMN IF NOT EXISTS fornecedor_cnpj              TEXT,
  ADD COLUMN IF NOT EXISTS fornecedor_contato           TEXT,
  ADD COLUMN IF NOT EXISTS fornecedor_contato_nome      TEXT,
  ADD COLUMN IF NOT EXISTS fornecedor_contato_telefone  TEXT,
  ADD COLUMN IF NOT EXISTS numero_pedido_fip            INTEGER,
  ADD COLUMN IF NOT EXISTS pedido_pdf_url               TEXT,
  ADD COLUMN IF NOT EXISTS pedido_pdf_nome              TEXT,
  ADD COLUMN IF NOT EXISTS nf_numero                    TEXT,
  ADD COLUMN IF NOT EXISTS nf_data                      DATE,
  ADD COLUMN IF NOT EXISTS nf_pdf_url                   TEXT,
  ADD COLUMN IF NOT EXISTS status_documento             TEXT NOT NULL DEFAULT 'pendente_nf';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'solicitacoes_fat_direto'
    AND constraint_name = 'solicitacoes_fat_direto_status_documento_check'
  ) THEN
    ALTER TABLE solicitacoes_fat_direto
      ADD CONSTRAINT solicitacoes_fat_direto_status_documento_check
      CHECK (status_documento IN ('pendente_nf','nf_recebida','pago'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS itens_solicitacao_fat_direto (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  solicitacao_id   UUID NOT NULL REFERENCES solicitacoes_fat_direto(id) ON DELETE CASCADE,
  tarefa_id        UUID NOT NULL REFERENCES tarefas(id),
  descricao        TEXT NOT NULL,
  local            TEXT NOT NULL DEFAULT 'TORRE',
  qtde_solicitada  NUMERIC(15,3) NOT NULL,
  valor_unitario   NUMERIC(15,4) NOT NULL,
  valor_total      NUMERIC(15,2) GENERATED ALWAYS AS (qtde_solicitada * valor_unitario) STORED,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE itens_solicitacao_fat_direto
  ADD COLUMN IF NOT EXISTS detalhamento_id UUID REFERENCES detalhamentos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS notas_fiscais_fat_direto (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  solicitacao_id   UUID NOT NULL REFERENCES solicitacoes_fat_direto(id),
  numero_nf        TEXT NOT NULL,
  emitente         TEXT NOT NULL,
  cnpj_emitente    TEXT,
  valor            NUMERIC(15,2) NOT NULL,
  data_emissao     DATE NOT NULL,
  descricao        TEXT,
  url_arquivo      TEXT,
  status           TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','validada','rejeitada')),
  validado_por_id  UUID REFERENCES perfis(id),
  validado_em      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sol_fatd_contrato      ON solicitacoes_fat_direto(contrato_id);
CREATE INDEX IF NOT EXISTS idx_sol_fatd_status        ON solicitacoes_fat_direto(status);
CREATE INDEX IF NOT EXISTS idx_nf_fatd_sol            ON notas_fiscais_fat_direto(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_itens_sol_detalhamento ON itens_solicitacao_fat_direto(detalhamento_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('faturamento-direto','faturamento-direto',true,52428800,ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
`

export async function POST(req: Request) {
  // Verifica token de autorização
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace('Bearer ', '').trim()
  const expected = getSupabaseServiceRoleKey()
  if (!token || token !== expected) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const url = getSupabaseUrl()
  const projectRef = url.replace('https://', '').replace('.supabase.co', '')

  if (!projectRef) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL não configurada' }, { status: 500 })
  }

  // Tenta conectar via Session Pooler com JWT como senha
  const regions = ['us-east-1', 'eu-west-1', 'ap-southeast-1', 'us-west-1', 'sa-east-1']
  let sql: ReturnType<typeof postgres> | null = null
  let connectedRegion = ''

  for (const region of regions) {
    try {
      const connString = `postgresql://postgres.${projectRef}:${expected}@aws-0-${region}.pooler.supabase.com:5432/postgres`
      const candidate = postgres(connString, { max: 1, connect_timeout: 5 })
      await candidate`SELECT 1`
      sql = candidate
      connectedRegion = region
      break
    } catch {
      // try next region
    }
  }

  if (!sql) {
    return NextResponse.json({
      error: 'Não foi possível conectar ao banco de dados. Adicione a DATABASE_URL nas variáveis de ambiente do Vercel.',
      hint: 'Vá em Supabase → Settings → Database → Connection string (Session pooler) e adicione como DATABASE_URL no Vercel.',
    }, { status: 500 })
  }

  try {
    // Executa cada statement separadamente
    const statements = MIGRATION_SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 10 && !s.startsWith('--'))

    const results: string[] = []
    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt + ';')
        results.push(`OK: ${stmt.substring(0, 60).replace(/\n/g, ' ')}...`)
      } catch (e: any) {
        // Ignora erros de "já existe" (idempotente)
        if (!e.message?.includes('already exists') && !e.message?.includes('ja existe')) {
          results.push(`WARN: ${e.message?.substring(0, 100)}`)
        }
      }
    }
    await sql.end()

    return NextResponse.json({
      ok: true,
      region: connectedRegion,
      statements_run: results.length,
      results,
    })
  } catch (e: any) {
    await sql?.end()
    return apiError(e)
  }
}

export async function GET() {
  return NextResponse.json({
    info: 'Endpoint de migration fat-direto. Use POST com Authorization: Bearer {SERVICE_ROLE_KEY}',
    tables_needed: ['solicitacoes_fat_direto', 'itens_solicitacao_fat_direto', 'notas_fiscais_fat_direto'],
  })
}
