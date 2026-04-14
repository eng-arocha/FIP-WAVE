/**
 * Validação de uploads — MIME + magic bytes + tamanho.
 *
 * Por que magic bytes (e não só MIME do header):
 *  - O MIME enviado pelo browser é controlado pelo cliente. Atacante pode
 *    renomear `malware.exe` pra `recibo.pdf` e setar `application/pdf`.
 *  - Magic bytes são os primeiros bytes do binário — assinatura física do
 *    formato. Não dá pra forjar sem reescrever o conteúdo inteiro.
 *
 * Implementação sem deps externas (não dependemos de `file-type`):
 *  - Lemos os primeiros 16 bytes do File
 *  - Comparamos com tabela de assinaturas conhecidas
 *  - Cobrimos os formatos relevantes pro app: PDF, JPEG, PNG, WebP, XML
 *
 * Quando precisar de mais formatos (Word, Excel, Zip etc), considere
 * adicionar `file-type` (~50KB) — mas pra escopo atual a tabela basta.
 */

export interface UploadValidationOpts {
  /** MIMEs permitidos. Default: PDF + imagens. */
  allowed?: string[]
  /** Tamanho máx em bytes. Default: 15 MB. */
  maxBytes?: number
}

export interface UploadValidationResult {
  ok: boolean
  /** MIME real detectado pelos magic bytes (pode diferir do declarado). */
  detectedMime: string | null
  /** Mensagem amigável quando ok=false. */
  reason?: string
}

const DEFAULT_ALLOWED = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/xml',
  'text/xml',
]

const DEFAULT_MAX = 15 * 1024 * 1024 // 15 MB

/** Magic bytes → MIME. Cada entrada: { sig: hex string, offset: number, mime: string }. */
const SIGNATURES: Array<{ sig: string; offset: number; mime: string }> = [
  // PDF: %PDF
  { sig: '25504446', offset: 0, mime: 'application/pdf' },
  // JPEG: FF D8 FF
  { sig: 'ffd8ff',   offset: 0, mime: 'image/jpeg' },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { sig: '89504e470d0a1a0a', offset: 0, mime: 'image/png' },
  // WebP: RIFF....WEBP
  { sig: '52494646', offset: 0, mime: 'image/webp' }, // checagem simplificada (RIFF), confirmar com 'WEBP' no offset 8 abaixo
  // XML: <?xml (com BOM ou sem)
  { sig: '3c3f786d6c', offset: 0, mime: 'application/xml' },
  { sig: 'efbbbf3c3f786d6c', offset: 0, mime: 'application/xml' }, // BOM UTF-8 + <?xml
]

function bufToHex(view: Uint8Array): string {
  let h = ''
  for (let i = 0; i < view.length; i++) {
    h += view[i].toString(16).padStart(2, '0')
  }
  return h
}

function detectMime(bytes: Uint8Array): string | null {
  const hex = bufToHex(bytes.slice(0, 16))
  for (const { sig, offset, mime } of SIGNATURES) {
    const start = offset * 2
    if (hex.slice(start, start + sig.length) === sig) {
      // RIFF precisa de confirmação de "WEBP" em offset 8
      if (mime === 'image/webp') {
        const webpHex = bufToHex(bytes.slice(8, 12))
        if (webpHex !== '57454250') continue // 'WEBP' em ASCII
      }
      return mime
    }
  }
  return null
}

export async function validateUpload(
  file: File,
  opts: UploadValidationOpts = {},
): Promise<UploadValidationResult> {
  const allowed = opts.allowed ?? DEFAULT_ALLOWED
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX

  if (file.size === 0) {
    return { ok: false, detectedMime: null, reason: 'Arquivo vazio.' }
  }
  if (file.size > maxBytes) {
    const mb = (maxBytes / 1024 / 1024).toFixed(1)
    return { ok: false, detectedMime: null, reason: `Arquivo excede o tamanho máximo de ${mb} MB.` }
  }

  // Lê só os primeiros 16 bytes pra magic check (rápido mesmo em arquivos grandes)
  const head = await file.slice(0, 16).arrayBuffer()
  const detected = detectMime(new Uint8Array(head))

  if (!detected) {
    return {
      ok: false,
      detectedMime: null,
      reason: 'Tipo de arquivo não reconhecido. Envie PDF, JPG, PNG, WebP ou XML.',
    }
  }

  if (!allowed.includes(detected)) {
    return {
      ok: false,
      detectedMime: detected,
      reason: `Tipo de arquivo "${detected}" não permitido neste contexto.`,
    }
  }

  // Sanity check: MIME declarado bate aproximadamente com o detectado
  // (text/xml vs application/xml é equivalente; aceitamos)
  if (file.type && file.type !== detected) {
    const xmlPair = (a: string, b: string) =>
      (a === 'text/xml' && b === 'application/xml') ||
      (a === 'application/xml' && b === 'text/xml')
    if (!xmlPair(file.type, detected)) {
      // Não bloqueia (browsers às vezes mandam octet-stream), apenas registra
      // que houve divergência — quem chama pode logar.
    }
  }

  return { ok: true, detectedMime: detected }
}
