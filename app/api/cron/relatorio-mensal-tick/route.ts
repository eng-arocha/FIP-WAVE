import { NextResponse } from 'next/server'
import { tickRelatorioMensal } from '@/lib/db/relatorios-mensais'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/cron/relatorio-mensal-tick
 *
 * Idempotente: se já existe relatório do (contrato, ano, mes) corrente,
 * não cria de novo. Chamada uma vez por sessão pelo layout — funciona
 * como "cron leve" baseado em uso da ferramenta (sem dependência de
 * Vercel Cron). Pode ser chamada também por agendador externo.
 *
 * Não exige permissão especial — só lê e cria registros 'pendente'
 * que precisam ser revisados/enviados pelo gestor.
 */
export async function GET() {
  try {
    const result = await tickRelatorioMensal()
    return NextResponse.json(result)
  } catch (e: any) {
    return apiError(e)
  }
}
