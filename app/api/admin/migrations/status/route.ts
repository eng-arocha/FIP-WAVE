import { NextResponse } from 'next/server'
import { getConnection } from '@/lib/db/auto-migrate'

/**
 * GET /api/admin/migrations/status
 *
 * Retorna:
 *   - applied: lista de migrations registradas em _schema_migrations
 *   - schema: existência (bool) das colunas/tabelas das migrations 053-057
 *   - aurora_config: tolerancia_nf_valor e dias_alerta_pedido_atrasado do contrato Aurora
 *
 * Endpoint somente-leitura, expõe apenas metadata de schema.
 */
export async function GET() {
  let sql: Awaited<ReturnType<typeof getConnection>> | null = null
  try {
    sql = await getConnection()

    // 1) Versões aplicadas (todas, mas destacando 050+)
    const appliedAll = await sql<{ version: string; applied_at: string }[]>`
      SELECT version, applied_at::text AS applied_at
        FROM _schema_migrations
       ORDER BY version
    `

    const target = [
      '053_tolerancia_nf_fat_direto',
      '054_divergencia_pedido_cobertura',
      '055_dias_alerta_pedido_atrasado',
      '056_relatorios_mensais_fat_direto',
      '057_ajuste_saldo_divergencia',
    ]
    const appliedSet = new Set(appliedAll.map(r => r.version))

    const targetStatus = target.map(v => ({
      version: v,
      registered: appliedSet.has(v),
      applied_at: appliedAll.find(r => r.version === v)?.applied_at ?? null,
    }))

    // 2) Existência real de colunas/tabelas
    const checks = await sql<
      {
        m053_contratos_tolerancia: boolean
        m053_nf_divergencia_valor: boolean
        m053_nf_divergencia_excedente: boolean
        m053_nf_override: boolean
        m053_nf_motivo: boolean
        m054_sol_origem_id: boolean
        m054_sol_origem_nf_id: boolean
        m054_nf_tipo_rejeicao: boolean
        m055_contratos_dias_alerta: boolean
        m056_tabela_relatorios: boolean
        m057_sol_valor_original: boolean
        m057_sol_ajustes: boolean
      }[]
    >`
      SELECT
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='contratos' AND column_name='tolerancia_nf_valor')                  AS m053_contratos_tolerancia,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='notas_fiscais_fat_direto' AND column_name='divergencia_valor')     AS m053_nf_divergencia_valor,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='notas_fiscais_fat_direto' AND column_name='divergencia_excedente') AS m053_nf_divergencia_excedente,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='notas_fiscais_fat_direto' AND column_name='override_excede_saldo') AS m053_nf_override,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='notas_fiscais_fat_direto' AND column_name='motivo_divergencia')    AS m053_nf_motivo,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='solicitacoes_fat_direto' AND column_name='origem_divergencia_id')    AS m054_sol_origem_id,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='solicitacoes_fat_direto' AND column_name='origem_divergencia_nf_id') AS m054_sol_origem_nf_id,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='notas_fiscais_fat_direto' AND column_name='tipo_rejeicao')           AS m054_nf_tipo_rejeicao,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='contratos' AND column_name='dias_alerta_pedido_atrasado') AS m055_contratos_dias_alerta,
        EXISTS(SELECT 1 FROM information_schema.tables
               WHERE table_name='relatorios_mensais_fat_direto') AS m056_tabela_relatorios,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='solicitacoes_fat_direto' AND column_name='valor_aprovado_original') AS m057_sol_valor_original,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='solicitacoes_fat_direto' AND column_name='ajustes_divergencia')     AS m057_sol_ajustes
    `

    const schema = checks[0] ?? null

    // 3) Configuração do contrato Aurora (id fixo)
    let auroraConfig: any = null
    try {
      const rows = await sql<
        { id: string; nome: string | null; tolerancia_nf_valor: number | null; dias_alerta_pedido_atrasado: number | null }[]
      >`
        SELECT id, nome, tolerancia_nf_valor, dias_alerta_pedido_atrasado
          FROM contratos
         WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      `
      auroraConfig = rows[0] ?? null
    } catch (e: any) {
      auroraConfig = { error: e.message }
    }

    // 4) Resumo
    const allRegistered = targetStatus.every(t => t.registered)
    const allSchemaOk = schema
      ? Object.values(schema).every(v => v === true)
      : false

    return NextResponse.json({
      ok: allRegistered && allSchemaOk,
      summary: {
        all_target_registered: allRegistered,
        all_schema_objects_present: allSchemaOk,
        total_applied: appliedAll.length,
      },
      target: targetStatus,
      schema,
      aurora_config: auroraConfig,
      // Lista completa só nas últimas 10 pra não poluir
      applied_recent: appliedAll.slice(-10),
    })
  } catch (e: any) {
    // Endpoint de diagnóstico: retorna mensagem de erro completa pra debug.
    // Não expõe dados sensíveis — apenas metadata de schema.
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e), code: e?.code ?? null },
      { status: 500 }
    )
  } finally {
    await sql?.end()
  }
}
