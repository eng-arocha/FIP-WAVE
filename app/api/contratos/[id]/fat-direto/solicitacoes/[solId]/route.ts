import { NextResponse } from 'next/server'
import { getSolicitacao, checkPedidoFipDuplicado } from '@/lib/db/fat-direto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'

const ADMIN_EMAILS = ['eng.arocha@gmail.com']
const STORAGE_BUCKET = 'faturamento-direto'

/**
 * Extrai o storage path (`pedidos/{solId}/{nome}`) de uma URL pública do Supabase
 * ou, em fallback, monta a partir de solId + nome do anexo.
 */
function anexoStoragePath(anexo: { url?: string; nome?: string }, solId: string): string | null {
  if (!anexo) return null
  if (anexo.url) {
    const marker = `/object/public/${STORAGE_BUCKET}/`
    const i = anexo.url.indexOf(marker)
    if (i >= 0) return anexo.url.slice(i + marker.length)
  }
  if (anexo.nome) return `pedidos/${solId}/${anexo.nome}`
  return null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    return NextResponse.json(await getSolicitacao(solId))
  } catch (e: any) {
    return apiError(e)
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    const body = await req.json()
    const admin = createAdminClient()

    // Verifica duplicidade de numero_pedido_fip (excluindo a própria solicitação)
    if (body.numero_pedido_fip != null && body.numero_pedido_fip !== '') {
      const numero = typeof body.numero_pedido_fip === 'number'
        ? body.numero_pedido_fip
        : parseInt(String(body.numero_pedido_fip), 10)
      if (Number.isFinite(numero)) {
        const dup = await checkPedidoFipDuplicado(numero, solId)
        if (dup) {
          return NextResponse.json(
            { error: 'PEDIDO_FIP_DUPLICADO', pedidoFipDuplicado: dup },
            { status: 409 },
          )
        }
      }
    }

    // Cleanup de Storage: arquivos removidos da lista pelo usuário precisam ser
    // deletados do bucket também (caso contrário ficam órfãos). Comparamos a
    // lista atual no DB com a recebida e removemos os que sumiram.
    if (Array.isArray(body.pedido_anexos)) {
      const { data: current } = await admin
        .from('solicitacoes_fat_direto')
        .select('pedido_anexos')
        .eq('id', solId)
        .single()
      const existing: any[] = (current as any)?.pedido_anexos ?? []
      const novosUrls = new Set(
        (body.pedido_anexos as any[]).map(a => a?.url).filter(Boolean),
      )
      const removidos = existing.filter(a => a?.url && !novosUrls.has(a.url))
      const paths = removidos
        .map(a => anexoStoragePath(a, solId))
        .filter((p): p is string => !!p)
      if (paths.length > 0) {
        await admin.storage.from(STORAGE_BUCKET).remove(paths)
      }
    }

    // Atualiza dados do cabeçalho
    const headerUpdate: Record<string, unknown> = {
      fornecedor_razao_social: body.fornecedor_razao_social,
      fornecedor_cnpj: body.fornecedor_cnpj,
      fornecedor_contato: body.fornecedor_contato,
      fornecedor_contato_nome: body.fornecedor_contato_nome,
      fornecedor_contato_telefone: body.fornecedor_contato_telefone,
      observacoes: body.observacoes,
      numero_pedido_fip: body.numero_pedido_fip,
      valor_total: (body.itens as any[]).reduce((s: number, i: any) => s + (parseFloat(i.valor_total) || 0), 0),
    }
    // Permite atualizar lista de anexos (remoção pelo usuário no edit)
    if (Array.isArray(body.pedido_anexos)) {
      headerUpdate.pedido_anexos = body.pedido_anexos
      // Mantém compatibilidade: espelha primeiro anexo em pedido_pdf_url/_nome, ou limpa se vazio
      const first = body.pedido_anexos[0]
      headerUpdate.pedido_pdf_url = first?.url ?? null
      headerUpdate.pedido_pdf_nome = first?.nome ?? null
    }
    const { error: errSol } = await admin
      .from('solicitacoes_fat_direto')
      .update(headerUpdate)
      .eq('id', solId)
    if (errSol) {
      // Defesa-em-profundidade: se o índice único disparar (race entre check e update)
      if ((errSol as any)?.code === '23505' && /numero_pedido_fip/.test(String(errSol.message))) {
        return NextResponse.json(
          { error: 'PEDIDO_FIP_DUPLICADO', pedidoFipDuplicado: null },
          { status: 409 },
        )
      }
      throw errSol
    }

    // Substitui todos os itens
    await admin.from('itens_solicitacao_fat_direto').delete().eq('solicitacao_id', solId)
    const novosItens = (body.itens as any[]).map((it: any) => ({
      solicitacao_id: solId,
      tarefa_id: it.tarefa_id,
      detalhamento_id: it.detalhamento_id || null,
      descricao: it.descricao,
      local: it.local,
      qtde_solicitada: 1,
      valor_unitario: parseFloat(it.valor_total) || 0,
    }))
    const { error: errItens } = await admin.from('itens_solicitacao_fat_direto').insert(novosItens)
    if (errItens) throw errItens

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    let isAdmin = ADMIN_EMAILS.includes(user.email ?? '')
    if (!isAdmin) {
      const admin = createAdminClient()
      const { data: perfil } = await admin
        .from('perfis').select('perfil').eq('id', user.id).single()
      isAdmin = perfil?.perfil === 'admin'
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Apenas administradores podem deletar solicitações' }, { status: 403 })
    }

    const admin = createAdminClient()
    await admin.from('itens_solicitacao_fat_direto').delete().eq('solicitacao_id', solId)
    await admin.from('notas_fiscais_fat_direto').delete().eq('solicitacao_id', solId)
    const { error } = await admin.from('solicitacoes_fat_direto').delete().eq('id', solId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}

