/**
 * Smoke tests — cobrem 5 caminhos críticos sem precisar de Supabase
 * rodando. Validam a LÓGICA das libs que estão entre os endpoints e o
 * banco. CI bloqueia merge se algum quebrar.
 *
 * Por que não Playwright/E2E completo agora:
 *  - E2E exige Supabase + Resend + browser headless = setup pesado.
 *  - Smoke testa o que mais provavelmente regride (cálculos, validações,
 *    helpers de segurança) sem custo de infra.
 *
 * Próxima evolução: adicionar Playwright pra fluxos UI completos.
 */

import { describe, it, expect } from 'vitest'

// ─── 1. Cálculo de retenções fiscais ─────────────────────────────────
import { sugerirRetencoes, totalRetido, valorLiquido, PERFIS_RETENCAO } from '@/lib/fiscal/retencoes'

describe('retenções fiscais', () => {
  it('serviço de mão-de-obra: aplica todas as retenções', () => {
    const r = sugerirRetencoes(10000, PERFIS_RETENCAO.servico_mao_obra)
    expect(r.retencao_iss).toBe(500)         // 5% * 10000
    expect(r.retencao_inss).toBe(1100)       // 11%
    expect(r.retencao_irrf).toBe(150)        // 1.5%
    expect(r.retencao_csrf).toBe(465)        // 4.65%
    expect(totalRetido(r)).toBeCloseTo(2215, 2)
    expect(valorLiquido(10000, r)).toBeCloseTo(7785, 2)
  })

  it('material puro: zero retenção', () => {
    const r = sugerirRetencoes(5000, PERFIS_RETENCAO.material)
    expect(totalRetido(r)).toBe(0)
    expect(valorLiquido(5000, r)).toBe(5000)
  })

  it('aplica limite mínimo de IRRF', () => {
    // R$ 100 * 1.5% = R$ 1.50 < R$ 10 → zera
    const r = sugerirRetencoes(100, PERFIS_RETENCAO.servico_mao_obra)
    expect(r.retencao_irrf).toBe(0)
  })
})

// ─── 2. Hash determinístico de boletim ────────────────────────────────
import { hashBoletim, shortHash } from '@/lib/api/boletim-hash'

describe('boletim hash', () => {
  const base = {
    contrato_numero: 'CT-001',
    medicao_numero: 1,
    periodo_referencia: '2024-12',
    valor_total: 100000,
    data_aprovacao: '2024-12-15T10:00:00Z',
    aprovador_nome: 'Engenheiro X',
    itens: [
      { codigo: 'A.1', quantidade_medida: 10, valor_unitario: 100 },
      { codigo: 'A.2', quantidade_medida: 5,  valor_unitario: 200 },
    ],
  }

  it('hash determinístico (mesmo input = mesmo hash)', () => {
    expect(hashBoletim(base)).toBe(hashBoletim(base))
  })

  it('ordem dos itens não altera hash (canonicalização)', () => {
    const reverso = { ...base, itens: [...base.itens].reverse() }
    expect(hashBoletim(reverso)).toBe(hashBoletim(base))
  })

  it('mudança em valor altera hash', () => {
    const alt = { ...base, valor_total: 100001 }
    expect(hashBoletim(alt)).not.toBe(hashBoletim(base))
  })

  it('shortHash retorna 8 chars uppercase', () => {
    const s = shortHash(hashBoletim(base))
    expect(s).toMatch(/^[0-9A-F]{8}$/)
  })
})

// ─── 3. Validação Zod nos primitivos ──────────────────────────────────
import { cnpj, cpf, email, periodoMes, dataIso, valorMonetario } from '@/lib/api/schema'

describe('schema validators', () => {
  it('cnpj limpa máscara e valida 14 dígitos', () => {
    expect(cnpj().parse('12.345.678/0001-95')).toBe('12345678000195')
    expect(() => cnpj().parse('12345')).toThrow()
  })

  it('cpf limpa máscara e valida 11 dígitos', () => {
    expect(cpf().parse('123.456.789-01')).toBe('12345678901')
    expect(() => cpf().parse('12345')).toThrow()
  })

  it('email normaliza lowercase e valida formato', () => {
    expect(email().parse('  USER@TEST.COM ')).toBe('user@test.com')
    expect(() => email().parse('not-email')).toThrow()
  })

  it('periodoMes aceita YYYY-MM', () => {
    expect(periodoMes().parse('2024-12')).toBe('2024-12')
    expect(() => periodoMes().parse('2024-13')).not.toThrow() // só formato, não validade
    expect(() => periodoMes().parse('24-12')).toThrow()
  })

  it('dataIso aceita YYYY-MM-DD', () => {
    expect(dataIso().parse('2024-12-31')).toBe('2024-12-31')
    expect(() => dataIso().parse('31/12/2024')).toThrow()
  })

  it('valorMonetario rejeita negativo e não-finito', () => {
    expect(() => valorMonetario().parse(-1)).toThrow()
    expect(() => valorMonetario().parse(NaN)).toThrow()
    expect(() => valorMonetario().parse(Infinity)).toThrow()
    expect(valorMonetario().parse(100)).toBe(100)
  })
})

// ─── 4. CSV escape (RFC 4180) ─────────────────────────────────────────
import { toCsv } from '@/lib/utils/csv'

describe('csv utils', () => {
  it('escapa aspas duplas e wrappa células com vírgula', () => {
    const csv = toCsv(
      [{ nome: 'João, Silva', obs: 'tem "aspas"' }],
      [
        { header: 'Nome', get: r => r.nome },
        { header: 'Obs',  get: r => r.obs },
      ],
    )
    expect(csv).toContain('"João, Silva"')
    expect(csv).toContain('"tem ""aspas"""')
  })

  it('inicia com BOM UTF-8 pra Excel', () => {
    const csv = toCsv([], [{ header: 'X', get: () => '' }])
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
  })

  it('formata Date como YYYY-MM-DD', () => {
    const csv = toCsv(
      [{ d: new Date('2024-12-15T10:00:00Z') }],
      [{ header: 'Data', get: r => r.d }],
    )
    expect(csv).toContain('2024-12-15')
  })
})

// ─── 5. Rate limiting ─────────────────────────────────────────────────
import { rateLimit } from '@/lib/api/rate-limit'

describe('rate limit', () => {
  it('bloqueia após max requests na janela', () => {
    const key = `test:${Date.now()}-${Math.random()}`
    for (let i = 0; i < 3; i++) {
      const r = rateLimit({ key, max: 3, windowMs: 60_000 })
      expect(r.ok).toBe(true)
    }
    const block = rateLimit({ key, max: 3, windowMs: 60_000 })
    expect(block.ok).toBe(false)
    expect(block.retryAfterSec).toBeGreaterThan(0)
  })

  it('janelas independentes por chave', () => {
    const key1 = `t1:${Math.random()}`
    const key2 = `t2:${Math.random()}`
    rateLimit({ key: key1, max: 1, windowMs: 60_000 })
    expect(rateLimit({ key: key1, max: 1, windowMs: 60_000 }).ok).toBe(false)
    expect(rateLimit({ key: key2, max: 1, windowMs: 60_000 }).ok).toBe(true)
  })
})
