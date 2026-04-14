import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getMedicoes, createMedicao } from '@/lib/db/medicoes'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid, email, cnpj, dataIso, periodoMes } from '@/lib/api/schema'

const Item = z.object({
  detalhamento_id: uuid(),
  quantidade_medida: z.number().nonnegative().finite(),
  valor_unitario: z.number().nonnegative().finite(),
})

const Nf = z.object({
  numero_nf: z.string().min(1).max(50),
  emitente: z.string().min(1).max(500),
  cnpj_emitente: cnpj().optional(),
  valor: z.number().positive().finite(),
  data_emissao: dataIso(),
})

const Body = z.object({
  periodo_referencia: periodoMes(),
  tipo: z.enum(['servico', 'faturamento_direto', 'misto']),
  solicitante_nome: z.string().min(1).max(255),
  solicitante_email: email(),
  observacoes: z.string().max(2000).optional(),
  itens: z.array(Item).min(1, 'Informe pelo menos um item.'),
  notas_fiscais: z.array(Nf).optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await getMedicoes(id)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const data = await createMedicao({ ...parsed.data, contrato_id: id })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
