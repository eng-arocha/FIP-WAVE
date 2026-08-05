import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/api/rate-limit'
import { requireAlgumaPermissao } from '@/lib/api/auth'
import { log } from '@/lib/log'

// pdf-parse precisa do runtime Node.js (não funciona no Edge Runtime)
export const runtime = 'nodejs'

export async function POST(req: Request) {
  // Parse de arquivo é CPU-pesado — limita abuso por IP.
  const limitacao = rateLimit({ key: 'parse-pedido:' + clientIp(req), max: 30, windowMs: 10 * 60_000 })
  if (!limitacao.ok) {
    return NextResponse.json(
      { error: `Muitas requisições. Aguarde ${limitacao.retryAfterSec ?? 60}s.` },
      { status: 429 }
    )
  }
  // Aceita qualquer permissão que um perfil editor/engenheiro tenha —
  // o template "Engenheiro FIP" do banco tem nf_fat_direto.lancar e
  // contratos.editar, mas pode não ter documentos.criar (fix pós-#12).
  const negado = await requireAlgumaPermissao(['documentos', 'criar'], ['nf_fat_direto', 'lancar'], ['contratos', 'editar'])
  if (negado) return negado
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Apenas arquivos PDF são suportados' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // require em runtime evita (1) o bug do pdf-parse que tenta ler test/version1.3.pdf
    // em tempo de build e (2) o erro de tipos no caminho sub-path do @types/pdf-parse
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse') as (
      buffer: Buffer,
      options?: { max?: number }
    ) => Promise<{ text: string }>

    // Parsear apenas página 1 — headers se repetem em cada página
    const data = await pdfParse(buffer, { max: 1 })
    const text = data.text

    // ── 1. Número do pedido ────────────────────────────────────────────────
    // "Pedido 867 Data do pedido ..." — \b evita match em "Pedido de Compra"
    const pedido = text.match(/\bPedido\s+(\d+)\s+Data/i)?.[1] ?? ''

    // ── 2. Isolar bloco "Dados do fornecedor" ─────────────────────────────
    // Evita capturar campos da seção WAVE (CNPJ, Telefone, etc.)
    const fornBlock =
      text.match(/Dados do fornecedor([\s\S]*?)(?:Informa[cç][oõ]es para entrega|Insumo\s)/i)?.[1] ??
      text

    // ── 3. Razão Social ───────────────────────────────────────────────────
    // Remove prefixo numérico ex: "27 - " ou "418 - "
    const razao =
      fornBlock.match(/Raz[aã]o social\s+(?:\d+\s*[-–]\s*)?(.+)/i)?.[1]?.trim() ?? ''

    // ── 4. CNPJ ───────────────────────────────────────────────────────────
    // Para antes de " IE" (ex: "07.207.491/0004-38 IE 067134106")
    const cnpj =
      fornBlock.match(/CNPJ\/CPF\s+([\d.\/\-]+)/i)?.[1]?.trim() ?? ''

    // ── 5. Telefone ───────────────────────────────────────────────────────
    // Formato variável: "(85) 3022-2447" ou "(85)2822255"
    // Para antes de espaço duplo, "Fax" ou quebra de linha
    const telRaw =
      fornBlock.match(/Telefone\s+([\d()\s\-\.]+?)(?:\s{2,}|Fax|\n)/i)?.[1]?.trim() ?? ''

    // ── 6. Vendedor (contato) ─────────────────────────────────────────────
    // Nos modelos analisados o campo está vazio — retorna '' se seguido de "E-mail"
    const vendedorRaw =
      fornBlock.match(/Vendedor\s+(.*?)(?:\s+E-mail|\s+Representante|\n)/i)?.[1]?.trim() ?? ''
    const vendedor = vendedorRaw.toLowerCase().startsWith('e-mail') ? '' : vendedorRaw

    // PDF sem camada de texto (digitalizado/imagem) devolve tudo vazio. Antes
    // isso virava um ok:true silencioso e a tela parecia "não ler" o pedido.
    const achouAlgo = !!(pedido || razao || cnpj)
    if (!achouAlgo) {
      const semTexto = text.trim().length < 20
      return NextResponse.json({
        ok: false,
        code: semTexto ? 'PDF_SEM_TEXTO' : 'LAYOUT_NAO_RECONHECIDO',
        error: semTexto
          ? 'Este PDF não tem texto selecionável (parece digitalizado/imagem). Preencha os campos manualmente ou envie o PDF original do pedido.'
          : 'Não foi possível reconhecer o layout deste pedido. Confira se é o PDF do pedido de compra ou preencha os campos manualmente.',
      }, { status: 422 })
    }

    return NextResponse.json({
      ok: true,
      numero_pedido: pedido,
      razao_social: razao,
      cnpj,
      telefone: telRaw,
      contato: vendedor,
    })
  } catch (e: any) {
    const msg = e?.message || 'Falha ao ler o PDF.'
    log.error('parse_pedido_falhou', { erro: msg })
    // MODULE_NOT_FOUND aqui = pdf-parse fora do bundle do deploy (ver
    // serverExternalPackages no next.config.ts). Não é erro do usuário, e a
    // mensagem crua não ajudava ninguém a entender o que fazer.
    const infra = e?.code === 'MODULE_NOT_FOUND' || /Cannot find module/i.test(msg)
    return NextResponse.json({
      ok: false,
      code: infra ? 'LEITOR_INDISPONIVEL' : 'ERRO_LEITURA',
      error: infra
        ? 'O leitor de PDF está indisponível no servidor. Preencha os campos manualmente — já registramos a falha.'
        : `Não foi possível ler este PDF: ${msg}`,
    }, { status: infra ? 503 : 500 })
  }
}
