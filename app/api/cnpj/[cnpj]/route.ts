import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ cnpj: string }> }) {
  try {
    const { cnpj } = await params
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) {
      return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos' }, { status: 400 })
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
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
