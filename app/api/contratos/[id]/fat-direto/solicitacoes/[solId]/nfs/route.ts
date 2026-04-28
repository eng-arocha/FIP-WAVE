import { NextResponse } from 'next/server'
import { z } from 'zod'
import { criarNotaFiscal, NFMatchError } from '@/lib/db/fat-direto'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { cnpj, dataIso } from '@/lib/api/schema'
import { validateUpload } from '@/lib/api/upload-validation'
import { optimizeUpload } from '@/lib/server/optimize-upload'
import { log } from '@/lib/log'

const BUCKET = 'contratos-documentos'

/**
 * Schema da NF. Cobre tanto o path JSON quanto o multipart (após
 * coerção dos campos). Valida formato de data, limita tamanhos, e
 * valida CNPJ do emitente quando presente — base pro 3-way match.
 */
const NfSchema = z.object({
  numero_nf: z.string().trim().min(1, 'Número da NF é obrigatório.').max(50),
  emitente: z.string().max(500).optional(),
  cnpj_emitente: cnpj().optional(),
  valor: z.number().positive('Valor deve ser positivo.').finite(),
  data_emissao: dataIso(),
  data_recebimento: dataIso().optional(),
  data_vencimento: dataIso().optional(),
  descricao: z.string().max(2000).optional(),
  /** Override do aprovador: aceita data_emissao < data_aprovacao com auditoria. */
  override_data_anterior: z.boolean().optional(),
})

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
        // Aceita 'true'/'1' como string vinda de FormData
        override_data_anterior: ['true', '1', 'on'].includes(String(fd.get('override_data_anterior') ?? '')),
      }
      file = fd.get('arquivo') as File | null
    } else {
      body = await req.json()
    }

    const nfParsed = NfSchema.safeParse(body)
    if (!nfParsed.success) {
      const details = nfParsed.error.issues.map(i => ({
        path: i.path.join('.'), code: i.code, message: i.message,
      }))
      return NextResponse.json({ error: 'Dados inválidos.', details }, { status: 400 })
    }
    const nfBody = nfParsed.data

    // Diagnóstico: registra se override foi enviado, pra verificar via logs
    // que o flag está chegando ao servidor (caso o modal de confirmação
    // pareça não funcionar).
    if (nfBody.override_data_anterior) {
      log.info('nf_post_override_data_anterior', {
        solId,
        numero_nf: nfBody.numero_nf,
        data_emissao: nfBody.data_emissao,
      })
    }

    // Upload do arquivo PDF/imagem da NF, se enviado
    let arquivo_url: string | undefined
    if (file && file.size > 0) {
      // P1.6: valida MIME + magic bytes antes de aceitar o upload
      const v = await validateUpload(file)
      if (!v.ok) {
        return NextResponse.json(
          { error: `Arquivo da NF rejeitado: ${v.reason}`, code: 'UPLOAD_INVALIDO' },
          { status: 400 },
        )
      }

      // Compacta server-side: imagem → JPEG q75 ≤2400px (strip EXIF), PDF →
      // strip metadata + flatten forms, XML → minify. Reduz custo de Storage
      // sem perda de leitura. Se não der ganho, mantém original.
      const original = Buffer.from(await file.arrayBuffer())
      const optimized = await optimizeUpload(original, v.detectedMime ?? file.type)

      if (optimized.optimized) {
        log.info('nf_upload_compactado', {
          solId,
          sizeBefore: optimized.sizeBefore,
          sizeAfter:  optimized.sizeAfter,
          ratio: ((1 - optimized.sizeAfter / optimized.sizeBefore) * 100).toFixed(1) + '%',
          mimeIn: v.detectedMime ?? file.type,
          mimeOut: optimized.mime,
        })
      }

      const path = `nfs-fat-direto/${solId}/${Date.now()}.${optimized.ext}`
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, optimized.buffer, { contentType: optimized.mime, upsert: false })
      if (!upErr) {
        const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path)
        arquivo_url = urlData.publicUrl
      }
    }

    const nf = await criarNotaFiscal({
      solicitacao_id: solId,
      numero_nf: nfBody.numero_nf,
      emitente: nfBody.emitente,
      cnpj_emitente: nfBody.cnpj_emitente,
      valor: nfBody.valor,
      data_emissao: nfBody.data_emissao,
      data_recebimento: nfBody.data_recebimento,
      data_vencimento: nfBody.data_vencimento,
      descricao: nfBody.descricao,
      arquivo_url,
      override_data_anterior: nfBody.override_data_anterior,
    })
    return NextResponse.json(nf, { status: 201 })
  } catch (e: any) {
    // Violação de regra de negócio do 3-way match → 422 com detalhe estruturado
    if (e instanceof NFMatchError) {
      return NextResponse.json(
        { error: e.message, code: e.code, detail: e.detail },
        { status: 422 },
      )
    }
    return apiError(e)
  }
}
