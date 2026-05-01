import { NextResponse } from 'next/server'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { log } from '@/lib/log'

/**
 * GET /api/relatorios-mensais?status=pendente
 *
 * Lista relatórios mensais (default: status='pendente') de todos os
 * contratos. Usado pelo banner global na página de NFs e pela
 * página dedicada de relatórios.
 */
export async function GET(req: Request) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) return NextResponse.json({ error: 'Sem permissão.' }, { status: check.status })

    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'pendente'

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('relatorios_mensais_fat_direto')
      .select(`
        id, contrato_id, ano, mes, qtd_pedidos, valor_total_atrasado,
        sequencia_cobranca, status, gerado_em, enviado_em,
        contrato:contratos ( id, numero, descricao )
      `)
      .eq('status', status)
      .order('gerado_em', { ascending: false })
      .limit(100)

    if (error) {
      // Tabela ainda não criada (Migration 056 pendente) — retorna lista vazia
      // pra UI não quebrar. Usa o helper que conhece PGRST205 + 42P01 +
      // substring match na mensagem.
      if (isSchemaMissingError(error, ['relatorios_mensais_fat_direto'])) {
        log.warn('relatorios_mensais_tabela_pendente', {
          code: (error as any).code,
          message: (error as any).message,
        })
        return NextResponse.json([])
      }
      throw error
    }

    return NextResponse.json(data || [])
  } catch (e: any) {
    return apiError(e)
  }
}
