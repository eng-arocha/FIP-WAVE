/**
 * Hash determinístico de boletim de medição pra assinatura.
 *
 * Por que: queremos provar que UM boletim PDF específico (gerado em data X
 * com conteúdo Y) é íntegro. Se alguém adulterar o PDF, o hash não bate
 * mais com o registrado no banco.
 *
 * Estratégia:
 *   - Gera SHA-256 sobre o conteúdo CANÔNICO (não o PDF binário) — JSON
 *     normalizado dos dados do boletim. Isso desacopla do renderer.
 *   - Salva no banco junto com a medicao (coluna boletim_hash em migration).
 *   - Endpoint público /verificar/[hash] mostra os dados do boletim.
 *   - QR code no PDF aponta pra esse endpoint.
 *
 * Estratégia alternativa: assinatura criptográfica (Ed25519) com chave
 * privada do servidor. Mais forte mas precisa de gerenciamento de chave.
 * Por enquanto SHA-256 cobre 95% dos casos (verificação de integridade).
 */

import crypto from 'crypto'

export interface BoletimCanonical {
  contrato_numero: string
  medicao_numero: number | string
  periodo_referencia: string
  valor_total: number
  data_aprovacao: string | null
  aprovador_nome: string | null
  itens: Array<{ codigo: string; quantidade_medida: number; valor_unitario: number; valor_glosa?: number }>
}

/**
 * Constrói versão canônica (ordem de chaves estável, sem espaços extras)
 * pra hash determinístico que sobrevive a re-serializações.
 */
function canonicalJson(data: BoletimCanonical): string {
  const sorted = {
    contrato_numero: data.contrato_numero,
    medicao_numero: String(data.medicao_numero),
    periodo_referencia: data.periodo_referencia,
    valor_total: Number(data.valor_total).toFixed(2),
    data_aprovacao: data.data_aprovacao ?? '',
    aprovador_nome: data.aprovador_nome ?? '',
    itens: data.itens
      .map(i => ({
        codigo: i.codigo,
        quantidade_medida: Number(i.quantidade_medida).toFixed(3),
        valor_unitario: Number(i.valor_unitario).toFixed(4),
        valor_glosa: Number(i.valor_glosa ?? 0).toFixed(2),
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
  }
  return JSON.stringify(sorted)
}

/** SHA-256 em hex. */
export function hashBoletim(data: BoletimCanonical): string {
  const canonical = canonicalJson(data)
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

/** Curto pra exibir no PDF (8 chars iniciais — colisão suficientemente improvável). */
export function shortHash(hash: string): string {
  return hash.slice(0, 8).toUpperCase()
}

/**
 * URL pública de verificação. Configurável via APP_BASE_URL ou Vercel.
 */
export function verifyUrl(hash: string): string {
  const base = process.env.APP_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  return `${base}/verificar/${hash}`
}
