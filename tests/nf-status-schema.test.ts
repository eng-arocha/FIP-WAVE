import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { NF_STATUS_VALIDOS, nfStatusGravavel } from '@/lib/db/nf-status'

const ROOT = path.resolve(__dirname, '..')

/**
 * Guarda contra drift entre o vocabulário de status de NF no código e o CHECK
 * da tabela. O bug que motivou estes testes: código escrito antes da migration
 * 065 continuou usando 'rejeitada' / 'validada' / 'pendente' — em leitura isso
 * inflava o saldo do pedido (nada era descontado no encerramento de saldo), e
 * em escrita estourava o CHECK com violação de constraint.
 */
describe('vocabulário de status de NF vs. schema', () => {
  it('NF_STATUS_VALIDOS bate exatamente com o CHECK da migration 065', () => {
    const sql = readFileSync(
      path.join(ROOT, 'supabase/migrations/065_nf_workflow_aprovacao.sql'),
      'utf-8',
    )
    const m = sql.match(/CHECK\s*\(status\s+IN\s*\(([^)]+)\)\)/i)
    expect(m, 'CHECK de status não encontrado na migration 065').toBeTruthy()

    const doSql = m![1]
      .split(',')
      .map(s => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort()

    expect(doSql).toEqual([...NF_STATUS_VALIDOS].sort())
  })

  it('os status legados não são graváveis', () => {
    for (const legado of ['rejeitada', 'validada', 'pendente', 'lancada']) {
      expect(nfStatusGravavel(legado)).toBe(false)
    }
    for (const valido of NF_STATUS_VALIDOS) {
      expect(nfStatusGravavel(valido)).toBe(true)
    }
    expect(nfStatusGravavel(null)).toBe(false)
  })

  it('nenhum código de produção grava um status legado em notas_fiscais_fat_direto', () => {
    // Heurística: sinaliza `status: '<legado>'` só quando há um
    // `.from('notas_fiscais_fat_direto')` por perto — outras tabelas
    // (webhook_deliveries, relatorios_mensais, solicitacoes_encerramento_saldo)
    // têm vocabulário próprio e usam 'pendente'/'rejeitada' legitimamente.
    // A janela é generosa porque o payload costuma ser montado numa const
    // algumas linhas antes do `.insert(...)` / `.update(...)`.
    const LEGADOS = ['rejeitada', 'validada', 'pendente']
    const JANELA = 40
    const alvos = ['app', 'lib', 'components']
    const ofensas: string[] = []

    const varrer = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next') continue
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) { varrer(full); continue }
        if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue

        const rel = path.relative(ROOT, full)
        // Rota de migração legada: recria o schema ANTIGO de propósito.
        if (rel.includes('admin/migrate-fat-direto')) continue

        const linhas = readFileSync(full, 'utf-8').split('\n')
        const ancoras = linhas
          .map((l, i) => (l.includes("from('notas_fiscais_fat_direto')") ? i : -1))
          .filter(i => i >= 0)
        if (ancoras.length === 0) continue

        linhas.forEach((linha, i) => {
          const semComentario = linha.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
          const perto = ancoras.some(a => Math.abs(a - i) <= JANELA)
          if (!perto) return
          for (const legado of LEGADOS) {
            if (new RegExp(`status:\\s*'${legado}'`).test(semComentario)) {
              ofensas.push(`${rel}:${i + 1} → status: '${legado}'`)
            }
          }
        })
      }
    }
    alvos.forEach(a => varrer(path.join(ROOT, a)))

    expect(ofensas, `grava status legado (viola o CHECK):\n${ofensas.join('\n')}`).toEqual([])
  })
})
