import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'faturamento-direto'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const solicitacaoId = formData.get('solicitacao_id') as string
    const tipo = (formData.get('tipo') as string) || 'pedido' // 'pedido' | 'nf'
    const numeroPedidoFip = (formData.get('numero_pedido_fip') as string) || ''
    const nfNumero = (formData.get('nf_numero') as string) || ''
    const nfData = (formData.get('nf_data') as string) || ''

    if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
    if (!solicitacaoId) return NextResponse.json({ error: 'solicitacao_id obrigatório' }, { status: 400 })

    const admin = createAdminClient()

    let storagePath: string
    let nomeArquivo: string
    if (tipo === 'pedido') {
      const num = numeroPedidoFip ? numeroPedidoFip.padStart(4, '0') : solicitacaoId.slice(0, 8)
      nomeArquivo = `PEDIDO-FIP-${num}.pdf`
      storagePath = `pedidos/${nomeArquivo}`
    } else {
      nomeArquivo = nfNumero ? `NF-${nfNumero}.pdf` : `NF-${Date.now()}.pdf`
      storagePath = `notas-fiscais/${nomeArquivo}`
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw uploadError

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(storagePath)
    const url = urlData?.publicUrl ?? null

    // Atualizar registro na tabela
    const updates: Record<string, unknown> = {}
    if (tipo === 'pedido') {
      updates.pedido_pdf_url = url
      updates.pedido_pdf_nome = nomeArquivo
    } else {
      updates.nf_pdf_url = url
      if (nfNumero) updates.nf_numero = nfNumero
      if (nfData) updates.nf_data = nfData
      updates.status_documento = 'nf_recebida'
    }

    const { error: dbError } = await admin
      .from('solicitacoes_fat_direto')
      .update(updates)
      .eq('id', solicitacaoId)

    if (dbError) throw dbError

    return NextResponse.json({ ok: true, url, nome: nomeArquivo })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
