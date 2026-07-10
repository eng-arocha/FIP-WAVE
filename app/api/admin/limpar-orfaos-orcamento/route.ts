import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/limpar-orfaos-orcamento
 *
 * Body JSON:
 *   { detalhamento_ids: string[] }
 *
 * Deleta os detalhamentos cujos IDs sao informados, MAS so se nao
 * houver FK em medicao_itens nem itens_solicitacao_fat_direto. Se
 * houver, retorna o detalhe e nao deleta. Apos deletar todos os
 * detalhamentos de uma tarefa, deleta a tarefa tambem (se ficou vazia).
 *
 * Usado pra "limpar" items que sumiram apos um upload de planilha
 * corrigida (ex: codigo 15.1.15 que virou 15.2.15 — apos o upload
 * subir 15.2.15 como novo, 15.1.15 fica orfao e precisa sair).
 *
 * NUNCA deleta automaticamente — usuario tem que pedir explicitamente
 * via lista de IDs (que veio da resposta do upload em 'orfaos_safe').
 */

export async function POST(req: Request) {
  const negado = await requireAdmin()
  if (negado) return negado
  try {
    const body = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body?.detalhamento_ids) ? body.detalhamento_ids : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'detalhamento_ids deve ser array nao-vazio' }, { status: 400 })
    }

    const admin = createAdminClient()

    const deletados: any[] = []
    const bloqueados: any[] = []
    const tarefasVaziasParaDeletar = new Set<string>()

    for (const id of ids) {
      // Verifica FKs antes de deletar
      const { count: cMI } = await admin
        .from('medicao_itens')
        .select('id', { count: 'exact', head: true })
        .eq('detalhamento_id', id)
      const { count: cFD } = await admin
        .from('itens_solicitacao_fat_direto')
        .select('id', { count: 'exact', head: true })
        .eq('detalhamento_id', id)

      const refs: string[] = []
      if ((cMI ?? 0) > 0) refs.push(`medicao_itens(${cMI})`)
      if ((cFD ?? 0) > 0) refs.push(`itens_solicitacao_fat_direto(${cFD})`)

      if (refs.length > 0) {
        bloqueados.push({ id, refs })
        continue
      }

      // Pega tarefa antes de deletar pra checar depois se ficou vazia
      const { data: detInfo } = await admin
        .from('detalhamentos')
        .select('codigo, tarefa_id')
        .eq('id', id)
        .single()

      const { error } = await admin.from('detalhamentos').delete().eq('id', id)
      if (error) {
        bloqueados.push({ id, refs: [`erro: ${error.message}`] })
        continue
      }

      deletados.push({ id, codigo: (detInfo as any)?.codigo, tarefa_id: (detInfo as any)?.tarefa_id })
      if ((detInfo as any)?.tarefa_id) {
        tarefasVaziasParaDeletar.add((detInfo as any).tarefa_id)
      }
    }

    // Apos deletar detalhamentos, verifica quais tarefas ficaram vazias
    // e deleta-as tambem (limpa estrutura "fantasma").
    const tarefasDeletadas: string[] = []
    for (const tarefaId of tarefasVaziasParaDeletar) {
      const { count } = await admin
        .from('detalhamentos')
        .select('id', { count: 'exact', head: true })
        .eq('tarefa_id', tarefaId)
      if ((count ?? 0) === 0) {
        await admin.from('tarefas').delete().eq('id', tarefaId)
        tarefasDeletadas.push(tarefaId)
      }
    }

    return NextResponse.json({
      ok: true,
      total_deletados: deletados.length,
      total_bloqueados: bloqueados.length,
      total_tarefas_deletadas: tarefasDeletadas.length,
      deletados,
      bloqueados,
      tarefas_deletadas: tarefasDeletadas,
    })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function GET() {
  const negado = await requireAdmin()
  if (negado) return negado
  return NextResponse.json({
    info: 'POST com body { detalhamento_ids: string[] } pra deletar orfaos seguros',
    fonte_dos_ids: 'response do POST /api/contratos/[id]/planilha/upload em orcamento.orfaos_safe[].id',
  })
}
