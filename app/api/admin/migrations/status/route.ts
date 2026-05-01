import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// v2 - REST via Supabase
/**
 * GET /api/admin/migrations/status
 *
 * Verifica via Supabase REST (PostgREST) se as colunas/tabelas das
 * migrations 053-057 existem. Detecção: tenta SELECT na coluna específica
 * com LIMIT 0 — se a coluna não existir, PostgREST devolve erro 42703.
 *
 * Não usa conexão postgres direta (Vercel bloqueia pooler em alguns casos).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Check = {
  migration: string
  description: string
  ok: boolean
  error?: string
}

async function probeColumn(
  sb: ReturnType<typeof createAdminClient>,
  table: string,
  columns: string[],
): Promise<{ ok: boolean; error?: string }> {
  // LIMIT 0 evita custo de leitura — só queremos saber se a coluna existe.
  const { error } = await sb.from(table).select(columns.join(',')).limit(0)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

async function probeTable(
  sb: ReturnType<typeof createAdminClient>,
  table: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from(table).select('*').limit(0)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function GET() {
  try {
    const sb = createAdminClient()

    const checks: Check[] = []

    // 053: contratos.tolerancia_nf_valor
    const c053a = await probeColumn(sb, 'contratos', ['tolerancia_nf_valor'])
    checks.push({
      migration: '053',
      description: 'contratos.tolerancia_nf_valor',
      ...c053a,
    })

    // 053: notas_fiscais_fat_direto.divergencia_*
    const c053b = await probeColumn(sb, 'notas_fiscais_fat_direto', [
      'divergencia_valor',
      'divergencia_excedente',
      'override_excede_saldo',
      'motivo_divergencia',
    ])
    checks.push({
      migration: '053',
      description: 'notas_fiscais_fat_direto: divergencia_valor, divergencia_excedente, override_excede_saldo, motivo_divergencia',
      ...c053b,
    })

    // 054: solicitacoes_fat_direto.origem_divergencia_*
    const c054a = await probeColumn(sb, 'solicitacoes_fat_direto', [
      'origem_divergencia_id',
      'origem_divergencia_nf_id',
    ])
    checks.push({
      migration: '054',
      description: 'solicitacoes_fat_direto: origem_divergencia_id, origem_divergencia_nf_id',
      ...c054a,
    })

    // 054: notas_fiscais_fat_direto.tipo_rejeicao
    const c054b = await probeColumn(sb, 'notas_fiscais_fat_direto', ['tipo_rejeicao'])
    checks.push({
      migration: '054',
      description: 'notas_fiscais_fat_direto.tipo_rejeicao',
      ...c054b,
    })

    // 055: contratos.dias_alerta_pedido_atrasado
    const c055 = await probeColumn(sb, 'contratos', ['dias_alerta_pedido_atrasado'])
    checks.push({
      migration: '055',
      description: 'contratos.dias_alerta_pedido_atrasado',
      ...c055,
    })

    // 056: tabela relatorios_mensais_fat_direto
    const c056 = await probeTable(sb, 'relatorios_mensais_fat_direto')
    checks.push({
      migration: '056',
      description: 'tabela relatorios_mensais_fat_direto',
      ...c056,
    })

    // 057: solicitacoes_fat_direto.valor_aprovado_original / ajustes_divergencia
    const c057 = await probeColumn(sb, 'solicitacoes_fat_direto', [
      'valor_aprovado_original',
      'ajustes_divergencia',
    ])
    checks.push({
      migration: '057',
      description: 'solicitacoes_fat_direto: valor_aprovado_original, ajustes_divergencia',
      ...c057,
    })

    // Configuração do contrato Aurora (id fixo)
    let auroraConfig: any = null
    try {
      const { data, error } = await sb
        .from('contratos')
        .select('id,numero,descricao,tolerancia_nf_valor,dias_alerta_pedido_atrasado')
        .eq('id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        .maybeSingle()
      if (error) auroraConfig = { error: error.message }
      else auroraConfig = data
    } catch (e: any) {
      auroraConfig = { error: e?.message ?? String(e) }
    }

    const grouped: Record<string, { ok: boolean; checks: Check[] }> = {}
    for (const c of checks) {
      const key = `m${c.migration}`
      if (!grouped[key]) grouped[key] = { ok: true, checks: [] }
      grouped[key].checks.push(c)
      if (!c.ok) grouped[key].ok = false
    }

    const allOk = Object.values(grouped).every(g => g.ok)

    return NextResponse.json({
      ok: allOk,
      summary: Object.fromEntries(
        Object.entries(grouped).map(([k, v]) => [k, v.ok])
      ),
      details: grouped,
      aurora_config: auroraConfig,
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e), code: e?.code ?? null },
      { status: 500 }
    )
  }
}
