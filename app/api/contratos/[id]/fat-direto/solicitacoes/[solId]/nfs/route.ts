import { NextResponse } from 'next/server'
import { criarNotaFiscal } from '@/lib/db/fat-direto'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

const BUCKET = 'contratos-documentos'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('notas_fiscais_fat_direto')
      .select('*')
      .eq('solicitacao_id', solId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    const admin = createAdminClient()
    const ct = req.headers.get('content-type') || ''

    let body: Record<string, any> = {}
    let file: File | null = null

    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData()
      body = {
        numero_nf:       fd.get('numero_nf') as string,
        emitente:        (fd.get('emitente') as string) || undefined,
        cnpj_emitente:   (fd.get('cnpj_emitente') as string) || undefined,
        valor:           parseFloat(fd.get('valor') as string),
        data_emissao:    fd.get('data_emissao') as string,
        data_recebimento:(fd.get('data_recebimento') as string) || undefined,
        data_vencimento: (fd.get('data_vencimento') as string) || undefined,
      }
      file = fd.get('arquivo') as File | null
    } else {
      body = await req.json()
    }

    if (!body.numero_nf || !body.valor || !body.data_emissao) {
      return NextResponse.json({ error: 'Campos obrigatórios: numero_nf, valor, data_emissao' }, { status: 400 })
    }

    // Upload do arquivo PDF/imagem da NF, se enviado
    let arquivo_url: string | undefined
    if (file && file.size > 0) {
      const ext = file.name.split('.').pop() ?? 'pdf'
      const path = `nfs-fat-direto/${solId}/${Date.now()}.${ext}`
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: false })
      if (!upErr) {
        const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path)
        arquivo_url = urlData.publicUrl
      }
    }

    const nf = await criarNotaFiscal({
      solicitacao_id: solId,
      numero_nf: body.numero_nf,
      emitente: body.emitente,
      cnpj_emitente: body.cnpj_emitente,
      valor: body.valor,
      data_emissao: body.data_emissao,
      data_recebimento: body.data_recebimento,
      data_vencimento: body.data_vencimento,
      descricao: body.descricao,
      arquivo_url,
    })
    return NextResponse.json(nf, { status: 201 })
  } catch (e: any) {
    return apiError(e)
  }
}
