import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/api/rate-limit'
import { requireAlgumaPermissao } from '@/lib/api/auth'
import { log } from '@/lib/log'
import {
  extrairDadosPedido, camposReconhecidos, pdfSemTexto,
} from '@/lib/db/parse-pedido'

// pdf-parse precisa do runtime Node.js (não funciona no Edge Runtime)
export const runtime = 'nodejs'

type PdfParseFn = (
  buffer: Buffer,
  options?: { max?: number; version?: string },
) => Promise<{ text: string }>

/**
 * Carrega o pdf-parse.
 *
 * A lib só é alcançável por `require()` em runtime: o import estático dispara
 * o bug conhecido dela (tenta ler test/version1.3.pdf em tempo de build). Como
 * require dinâmico não é rastreável pelo bundler, `pdf-parse` está declarado em
 * `serverExternalPackages` (next.config.ts) pra ser copiado inteiro no deploy —
 * inclusive os builds do pdf.js, que a própria lib carrega por outro require
 * dinâmico (`./pdf.js/${version}/build/pdf.js`).
 *
 * Erro aqui é falha de EMPACOTAMENTO, não do PDF do usuário — por isso a
 * distinção é feita no chamador (503 x 500).
 */
function carregarPdfParse(): PdfParseFn {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('pdf-parse/lib/pdf-parse') as PdfParseFn
}

class LeitorIndisponivelError extends Error {
  constructor(readonly causa: string) {
    super(`Leitor de PDF indisponível: ${causa}`)
  }
}

/** Lê a página 1 do PDF. Página 1 basta — os headers se repetem nas demais. */
async function lerPrimeiraPagina(buffer: Buffer): Promise<string> {
  let pdfParse: PdfParseFn
  try {
    pdfParse = carregarPdfParse()
  } catch (e: any) {
    throw new LeitorIndisponivelError(e?.message || 'falha ao carregar pdf-parse')
  }
  try {
    // version explícito: o default da lib é resolvido por require dinâmico e
    // fixá-lo deixa claro qual build do pdf.js precisa estar no deploy.
    const data = await pdfParse(buffer, { max: 1, version: 'v1.10.100' })
    return data.text ?? ''
  } catch (e: any) {
    // Um require que falha DENTRO da lib (build do pdf.js ausente no bundle)
    // também é problema de empacotamento, não do arquivo enviado.
    const msg = e?.message || ''
    if (e?.code === 'MODULE_NOT_FOUND' || /Cannot find module/i.test(msg)) {
      throw new LeitorIndisponivelError(msg)
    }
    throw e
  }
}

/**
 * GET — sonda de saúde do leitor de PDF.
 *
 * Existe porque a falha de empacotamento só aparecia em produção e o sintoma
 * era um 500 opaco na tela de novo pedido. Abrir esta URL diz na hora se o
 * problema é o deploy ou o arquivo enviado.
 */
export async function GET() {
  try {
    carregarPdfParse()
    return NextResponse.json({ leitor_ok: true, versao_pdfjs: 'v1.10.100' })
  } catch (e: any) {
    return NextResponse.json(
      { leitor_ok: false, detalhe: e?.message || 'erro desconhecido' },
      { status: 503 },
    )
  }
}

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

    const text = await lerPrimeiraPagina(buffer)

    const dados = extrairDadosPedido(text)

    // PDF sem camada de texto (digitalizado/imagem) devolve tudo vazio. Antes
    // isso virava um ok:true silencioso e a tela parecia "não ler" o pedido.
    if (camposReconhecidos(dados) === 0) {
      const semTexto = pdfSemTexto(text)
      return NextResponse.json({
        ok: false,
        code: semTexto ? 'PDF_SEM_TEXTO' : 'LAYOUT_NAO_RECONHECIDO',
        error: semTexto
          ? 'Este PDF não tem texto selecionável (parece digitalizado/imagem). Preencha os campos manualmente — o arquivo continua anexado ao pedido.'
          : 'Não reconhecemos o layout deste PDF como um pedido de compra. Preencha os campos manualmente — o arquivo continua anexado ao pedido.',
      }, { status: 422 })
    }

    return NextResponse.json({ ok: true, ...dados })
  } catch (e: any) {
    const msg = e?.message || 'Falha ao ler o PDF.'
    log.error('parse_pedido_falhou', e)

    if (e instanceof LeitorIndisponivelError) {
      return NextResponse.json({
        ok: false,
        code: 'LEITOR_INDISPONIVEL',
        error: 'O leitor de PDF está indisponível no servidor — não é problema do seu arquivo. '
             + 'Preencha os campos manualmente; o PDF continua anexado ao pedido.',
        detalhe: e.causa,
      }, { status: 503 })
    }

    // Qualquer outra falha é do arquivo em si (corrompido, protegido por senha,
    // XRef inválido). Devolve o motivo — antes ia um 500 opaco pra tela.
    return NextResponse.json({
      ok: false,
      code: 'ERRO_LEITURA',
      error: `Não foi possível ler este PDF (${msg}). Preencha os campos manualmente — o arquivo continua anexado ao pedido.`,
    }, { status: 422 })
  }
}
