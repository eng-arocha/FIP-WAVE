import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { log } from '@/lib/log'

/**
 * Otimização server-side de uploads para reduzir custo de Storage e tempo
 * de download. Sempre retorna um Buffer pronto pra subir; se a otimização
 * falhar ou aumentar o tamanho, devolve o original (sem regressão).
 *
 * Estratégia:
 *   - Imagens (JPG/PNG/WebP): re-encode JPEG q75, max 2400px no maior lado,
 *     strip EXIF/metadata. Foto de celular de 5MB vira ~300KB sem perda
 *     perceptível de leitura de NF.
 *   - PDF: strip metadata (autor/título/etc), flatten de forms (transforma
 *     em "documento de leitura" — sem campos editáveis), save com
 *     useObjectStreams. Ganho 5-20% em PDFs típicos. PDFs já bem
 *     comprimidos podem aumentar ligeiramente — nesses casos mantemos
 *     o original.
 *   - XML (NFe): minify whitespace, mantém o conteúdo.
 *   - Outros tipos: passa direto.
 */

export interface OptimizedUpload {
  buffer: Buffer
  /** MIME final (pode mudar — ex.: PNG → JPEG após re-encode). */
  mime: string
  /** Extensão final coerente com o MIME. */
  ext: string
  /** Tamanho antes da otimização. */
  sizeBefore: number
  /** Tamanho após a otimização. */
  sizeAfter: number
  /** True se conseguimos reduzir; false se mantivemos o original. */
  optimized: boolean
}

const IMAGE_MAX_DIMENSION = 2400
const JPEG_QUALITY = 75

function extFromMime(mime: string): string {
  switch (mime) {
    case 'application/pdf':                return 'pdf'
    case 'image/jpeg':                     return 'jpg'
    case 'image/png':                      return 'png'
    case 'image/webp':                     return 'webp'
    case 'application/xml': case 'text/xml': return 'xml'
    default:                               return 'bin'
  }
}

/**
 * Re-encode imagem para JPEG com qualidade controlada e tamanho máximo,
 * remove metadata. Retorna null se o resultado ficou maior que o original
 * (sinaliza pro caller manter o original).
 */
async function optimizeImage(buffer: Buffer): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const meta = await sharp(buffer).metadata()
    const longestEdge = Math.max(meta.width ?? 0, meta.height ?? 0)
    const needsResize = longestEdge > IMAGE_MAX_DIMENSION

    let pipeline = sharp(buffer, { failOn: 'truncated' }).rotate() // honra orientação EXIF antes de descartar
    if (needsResize) {
      pipeline = pipeline.resize({
        width:  meta.width  && meta.width  >= meta.height! ? IMAGE_MAX_DIMENSION : undefined,
        height: meta.height && meta.height >  meta.width!  ? IMAGE_MAX_DIMENSION : undefined,
        withoutEnlargement: true,
        fit: 'inside',
      })
    }
    const out = await pipeline
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .withMetadata({}) // strip EXIF/IPTC/XMP — só mantém orientação default
      .toBuffer()
    return { buffer: out, mime: 'image/jpeg' }
  } catch (e) {
    log.warn('optimize_image_failed', { error: (e as Error)?.message })
    return null
  }
}

/**
 * Otimização leve de PDF — útil para PDFs nativos. Não recomprime imagens
 * embarcadas (precisaria de Ghostscript que não temos no Vercel). Para
 * PDFs scaneados grandes, o ganho é mínimo — nesses casos retornamos
 * o original.
 */
async function optimizePdf(buffer: Buffer): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const pdf = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    })

    // Strip metadata — vira "documento de leitura" anônimo
    pdf.setTitle('')
    pdf.setAuthor('')
    pdf.setSubject('')
    pdf.setKeywords([])
    pdf.setProducer('FIP-WAVE')
    pdf.setCreator('FIP-WAVE')

    // Flatten de forms (se houver) → torna não-editável e remove overhead
    const form = pdf.getForm()
    try { form.flatten() } catch {/* sem forms ou flatten não suportado em algum field */}

    const out = await pdf.save({ useObjectStreams: true, addDefaultPage: false })
    return { buffer: Buffer.from(out), mime: 'application/pdf' }
  } catch (e) {
    log.warn('optimize_pdf_failed', { error: (e as Error)?.message })
    return null
  }
}

function optimizeXml(buffer: Buffer): { buffer: Buffer; mime: string } | null {
  try {
    const text = buffer.toString('utf-8')
    // Minify conservador: remove whitespace entre tags e quebras de linha
    // sem mexer em CDATA. NFe usa elementos sem content misto, então é seguro.
    const minified = text
      .replace(/>\s+</g, '><')
      .replace(/^\s+|\s+$/g, '')
      .replace(/\r\n|\r/g, '\n')
    return { buffer: Buffer.from(minified, 'utf-8'), mime: 'application/xml' }
  } catch {
    return null
  }
}

export async function optimizeUpload(input: Buffer, mime: string): Promise<OptimizedUpload> {
  const sizeBefore = input.length
  let optimized: { buffer: Buffer; mime: string } | null = null

  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
    optimized = await optimizeImage(input)
  } else if (mime === 'application/pdf') {
    optimized = await optimizePdf(input)
  } else if (mime === 'application/xml' || mime === 'text/xml') {
    optimized = optimizeXml(input)
  }

  if (!optimized || optimized.buffer.length >= sizeBefore) {
    return {
      buffer: input,
      mime,
      ext: extFromMime(mime),
      sizeBefore,
      sizeAfter: sizeBefore,
      optimized: false,
    }
  }

  return {
    buffer: optimized.buffer,
    mime: optimized.mime,
    ext: extFromMime(optimized.mime),
    sizeBefore,
    sizeAfter: optimized.buffer.length,
    optimized: true,
  }
}
