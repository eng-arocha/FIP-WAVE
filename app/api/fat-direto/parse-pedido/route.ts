import { NextResponse } from 'next/server'
import pdfParse from 'pdf-parse'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Apenas arquivos PDF são suportados' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

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

    return NextResponse.json({
      ok: true,
      numero_pedido: pedido,
      razao_social: razao,
      cnpj,
      telefone: telRaw,
      contato: vendedor,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
