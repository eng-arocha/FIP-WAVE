/**
 * Cálculo sugerido de retenções fiscais em NF de serviços.
 *
 * AVISO: Os valores aqui são SUGESTÕES baseadas em alíquotas comuns.
 * A aplicação correta depende:
 *   - Do CNAE / atividade do prestador
 *   - Do regime tributário (Simples, Lucro Presumido, Lucro Real)
 *   - Do município (ISS varia 2-5%)
 *   - Do valor mínimo de retenção (R$ 215,05 pra IRRF até 12/2024)
 *   - De acordos contratuais específicos
 *
 * O usuário SEMPRE pode sobrescrever os valores no formulário. Esta
 * função serve só pra "auto-fill inteligente" e pra evitar deixar tudo
 * zerado quando o operador esquece.
 */

export interface PerfilRetencao {
  /** Alíquota de ISS em decimal (0.05 = 5%). 0 quando NF é só material. */
  iss?: number
  /** Alíquota de INSS (geralmente 0.11 em mão-de-obra). */
  inss?: number
  /** Alíquota de IRRF (1.5% serviços profissionais). */
  irrf?: number
  /** Alíquota de CSRF agregado (4.65% = 1% CSLL + 3% COFINS + 0.65% PIS). */
  csrf?: number
}

/** Perfis comuns pra atalho no UI. */
export const PERFIS_RETENCAO: Record<string, PerfilRetencao> = {
  /** Material puro (compra de mercadoria) — sem retenções típicas. */
  material:           { iss: 0,     inss: 0,    irrf: 0,     csrf: 0      },
  /** Serviços de mão-de-obra (terraplenagem, montagem, etc). */
  servico_mao_obra:   { iss: 0.05,  inss: 0.11, irrf: 0.015, csrf: 0.0465 },
  /** Serviços técnicos profissionais (engenharia, consultoria). */
  servico_tecnico:    { iss: 0.05,  inss: 0,    irrf: 0.015, csrf: 0.0465 },
  /** Locação de equipamento. */
  locacao:            { iss: 0,     inss: 0,    irrf: 0.015, csrf: 0      },
}

/** Limites mínimos de retenção (valores RFB 2024-2025). */
export const LIMITES_MIN = {
  irrf: 10.00,    // Dispensa retenção se valor calculado < R$10
  inss: 0,        // INSS sempre retém
  csrf: 10.00,    // CSRF dispensado se < R$10
}

export interface ValoresRetencao {
  retencao_iss: number
  retencao_inss: number
  retencao_irrf: number
  retencao_csrf: number
  retencao_pis: number
  retencao_cofins: number
  retencao_outros: number
}

/** Arredonda pra 2 casas — padrão fiscal. */
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Calcula sugestão de retenções a partir de um valor bruto e um perfil.
 * Aplica limites mínimos (zera se ficar abaixo).
 */
export function sugerirRetencoes(valorBruto: number, perfil: PerfilRetencao): ValoresRetencao {
  const iss  = r2(valorBruto * (perfil.iss  ?? 0))
  const inss = r2(valorBruto * (perfil.inss ?? 0))
  const irrf = r2(valorBruto * (perfil.irrf ?? 0))
  const csrf = r2(valorBruto * (perfil.csrf ?? 0))

  return {
    retencao_iss:    iss,
    retencao_inss:   inss,
    retencao_irrf:   irrf >= LIMITES_MIN.irrf ? irrf : 0,
    retencao_csrf:   csrf >= LIMITES_MIN.csrf ? csrf : 0,
    retencao_pis:    0, // Tipicamente já incluso em CSRF, separado opcional
    retencao_cofins: 0,
    retencao_outros: 0,
  }
}

/** Total retido. */
export function totalRetido(v: Partial<ValoresRetencao>): number {
  return r2(
    (v.retencao_iss    ?? 0) +
    (v.retencao_inss   ?? 0) +
    (v.retencao_irrf   ?? 0) +
    (v.retencao_csrf   ?? 0) +
    (v.retencao_pis    ?? 0) +
    (v.retencao_cofins ?? 0) +
    (v.retencao_outros ?? 0)
  )
}

/** Valor líquido = bruto - total retido. */
export function valorLiquido(valorBruto: number, v: Partial<ValoresRetencao>): number {
  return r2(valorBruto - totalRetido(v))
}
