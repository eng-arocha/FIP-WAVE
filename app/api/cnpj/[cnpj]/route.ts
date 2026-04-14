import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api/error-response'
import { rateLimit, clientIp } from '@/lib/api/rate-limit'

export async function GET(req: Request, { params }: { params: Promise<{ cnpj: string }> }) {
  try {
    const { cnpj } = await params
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) {
      return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos' }, { status: 400 })
    }

    // P1.5: rate-limit por IP — 20 req/minuto. Protege a API gratuita
    // BrasilAPI de abuso e mantém disponibilidade pra todos os usuários.
    const ip = clientIp(req)
    const limit = rateLimit({ key: `cnpj:${ip}`, max: 20, windowMs: 60_000 })
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Muitas consultas. Aguarde alguns segundos.', retryAfter: limit.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec ?? 60) } },
      )
    }

    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 86400 }, // cache 24h
    })

    if (res.status === 404) {
      return NextResponse.json({ error: 'CNPJ não encontrado na Receita Federal' }, { status: 404 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: 'Erro ao consultar Receita Federal' }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({
      cnpj: data.cnpj,
      razao_social: data.razao_social,
      nome_fantasia: data.nome_fantasia || '',
      situacao_cadastral: data.descricao_situacao_cadastral,
      ativa: data.descricao_situacao_cadastral === 'ATIVA',
      logradouro: data.logradouro,
      municipio: data.municipio,
      uf: data.uf,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
