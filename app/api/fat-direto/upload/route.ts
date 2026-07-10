import { NextResponse } from 'next/server'
import { requireAlgumaPermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { validateUpload } from '@/lib/api/upload-validation'
import { optimizeUpload } from '@/lib/server/optimize-upload'
import { getSupabaseUrl } from '@/lib/supabase/env'
import { log } from '@/lib/log'

const BUCKET = 'faturamento-direto'

/** Valida que a URL aponta pro nosso bucket (defesa contra URL forjada). */
function isUrlNoNossoBucket(url: string): boolean {
  const supabaseUrl = getSupabaseUrl().replace(/\/+$/, '')
  if (!supabaseUrl) return false
  return url.startsWith(`${supabaseUrl}/storage/v1/object/public/${BUCKET}/`)
}

/**
 * Registra anexos JA enviados ao Storage (via signed URL) na coluna
 * pedido_anexos. Usado pelo fluxo de upload direto, que bypassa o limite
 * de ~4.5MB do body do Vercel. Faz merge com os anexos existentes.
 */
async function registrarAnexosJson(body: any) {
  const solicitacaoId = body?.solicitacao_id
  const tipo = body?.tipo || 'pedido'
  const anexos = Array.isArray(body?.anexos) ? body.anexos : []

  if (!solicitacaoId) return NextResponse.json({ error: 'solicitacao_id obrigatório' }, { status: 400 })
  if (tipo !== 'pedido') return NextResponse.json({ error: 'tipo inválido para registro JSON' }, { status: 400 })
  if (anexos.length === 0) return NextResponse.json({ error: 'Nenhum anexo informado' }, { status: 400 })

  // Sanitiza + valida cada anexo (url tem que ser do nosso bucket)
  const limpos: { nome: string; url: string; tamanho: number; tipo: string }[] = []
  for (const a of anexos) {
    if (!a?.url || typeof a.url !== 'string' || !isUrlNoNossoBucket(a.url)) {
      return NextResponse.json(
        { error: 'URL de anexo inválida (deve apontar pro Storage do FIP).', code: 'URL_INVALIDA' },
        { status: 400 },
      )
    }
    limpos.push({
      nome: String(a.nome || 'arquivo'),
      url: a.url,
      tamanho: Number(a.tamanho) || 0,
      tipo: String(a.tipo || 'application/octet-stream'),
    })
  }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('solicitacoes_fat_direto')
    .select('pedido_anexos')
    .eq('id', solicitacaoId)
    .single()

  const existing = ((current as any)?.pedido_anexos ?? []) as typeof limpos
  const merged = [...existing, ...limpos]

  const { error: dbError } = await admin
    .from('solicitacoes_fat_direto')
    .update({
      pedido_anexos: merged,
      pedido_pdf_url: merged[0]?.url ?? null,
      pedido_pdf_nome: merged[0]?.nome ?? null,
    })
    .eq('id', solicitacaoId)
  if (dbError) throw dbError

  return NextResponse.json({ ok: true, uploaded: limpos, total: merged.length })
}

export async function POST(req: Request) {
  // Aceita qualquer permissão que um perfil editor/engenheiro tenha —
  // o template "Engenheiro FIP" do banco tem nf_fat_direto.lancar e
  // contratos.editar, mas pode não ter documentos.criar (fix pós-#12).
  const negado = await requireAlgumaPermissao(['documentos', 'criar'], ['nf_fat_direto', 'lancar'], ['contratos', 'editar'])
  if (negado) return negado
  try {
    // Branch JSON: cliente ja subiu o arquivo via signed URL e so registra.
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      return await registrarAnexosJson(await req.json())
    }

    const formData = await req.formData()
    const solicitacaoId = formData.get('solicitacao_id') as string
    const tipo = (formData.get('tipo') as string) || 'pedido'
    const numeroPedidoFip = (formData.get('numero_pedido_fip') as string) || ''
    const nfNumero = (formData.get('nf_numero') as string) || ''
    const nfData = (formData.get('nf_data') as string) || ''

    if (!solicitacaoId) return NextResponse.json({ error: 'solicitacao_id obrigatório' }, { status: 400 })

    const admin = createAdminClient()

    // ── Suporte a múltiplos arquivos (campo 'files') ou arquivo único (campo 'file') ──
    const multipleEntries = formData.getAll('files') as File[]
    const singleFile = formData.get('file') as File | null
    const files: File[] = multipleEntries.length > 0 ? multipleEntries : singleFile ? [singleFile] : []

    if (files.length === 0) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const uploaded: { nome: string; url: string; tamanho: number; tipo: string }[] = []

    // P1.6: valida cada arquivo (MIME + magic bytes + tamanho) e já guarda o
    // mime detectado pra reusar na otimização (evita duplicar leitura).
    const validated: { file: File; detectedMime: string }[] = []
    for (const file of files) {
      const v = await validateUpload(file)
      if (!v.ok) {
        return NextResponse.json(
          { error: `Arquivo "${file.name}" rejeitado: ${v.reason}`, code: 'UPLOAD_INVALIDO' },
          { status: 400 },
        )
      }
      validated.push({ file, detectedMime: v.detectedMime ?? file.type })
    }

    for (const { file, detectedMime } of validated) {
      // Otimiza antes do upload (imagem → JPEG q75 ≤2400px; PDF → strip
      // metadata + flatten forms; XML → minify). Mantém original se não
      // houver ganho.
      const original = Buffer.from(await file.arrayBuffer())
      const optimized = await optimizeUpload(original, detectedMime)
      if (optimized.optimized) {
        log.info('pedido_upload_compactado', {
          solicitacaoId,
          sizeBefore: optimized.sizeBefore,
          sizeAfter:  optimized.sizeAfter,
          ratio: ((1 - optimized.sizeAfter / optimized.sizeBefore) * 100).toFixed(1) + '%',
          mimeIn: detectedMime,
          mimeOut: optimized.mime,
        })
      }

      let storagePath: string
      let nomeArquivo: string

      if (tipo === 'pedido') {
        const num = numeroPedidoFip ? numeroPedidoFip.padStart(4, '0') : solicitacaoId.slice(0, 8)
        // Usa a extensão do mime FINAL (otimizado pode ter mudado PNG→JPEG)
        const suffix = files.length > 1 ? `-${uploaded.length + 1}` : ''
        nomeArquivo = `PEDIDO-FIP-${num}${suffix}.${optimized.ext}`
        storagePath = `pedidos/${solicitacaoId}/${nomeArquivo}`
      } else {
        const ext = optimized.ext
        nomeArquivo = nfNumero ? `NF-${nfNumero}.${ext}` : `NF-${Date.now()}.${ext}`
        storagePath = `notas-fiscais/${nomeArquivo}`
      }

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, optimized.buffer, { contentType: optimized.mime, upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(storagePath)
      uploaded.push({
        nome: nomeArquivo,
        url: urlData?.publicUrl ?? '',
        tamanho: optimized.sizeAfter,
        tipo: optimized.mime,
      })
    }

    // Atualizar registro na tabela
    const updates: Record<string, unknown> = {}

    if (tipo === 'pedido') {
      // Manter compatibilidade: primeiro arquivo em pedido_pdf_url
      updates.pedido_pdf_url = uploaded[0].url
      updates.pedido_pdf_nome = uploaded[0].nome
      // Lista completa de anexos em pedido_anexos (JSONB)
      // Fazemos merge com os existentes para não apagar uploads anteriores
      const { data: current } = await admin
        .from('solicitacoes_fat_direto')
        .select('pedido_anexos')
        .eq('id', solicitacaoId)
        .single()

      const existing: typeof uploaded = (current as any)?.pedido_anexos ?? []
      updates.pedido_anexos = [...existing, ...uploaded]
    } else {
      updates.nf_pdf_url = uploaded[0].url
      if (nfNumero) updates.nf_numero = nfNumero
      if (nfData) updates.nf_data = nfData
      updates.status_documento = 'nf_recebida'
    }

    const { error: dbError } = await admin
      .from('solicitacoes_fat_direto')
      .update(updates)
      .eq('id', solicitacaoId)

    if (dbError) throw dbError

    return NextResponse.json({ ok: true, uploaded })
  } catch (e: any) {
    return apiError(e)
  }
}
