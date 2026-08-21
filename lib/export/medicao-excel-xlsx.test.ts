import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx-js-style'
import { exportarExcelMedicao, type GrupoLike } from './medicao-excel'

const grupos: GrupoLike[] = [{
  codigo: '1', nome: 'INSTALAÇÕES HIDROSSANITÁRIAS', disciplina: 'HIDRÁULICA',
  valor_global: 400000, valor_anterior: 50000, valor_atual: 60000, valor_total: 110000,
  valor_saldo: 290000, pct_total: 27.5,
  tarefas: [{
    codigo: '1.1', nome: 'PRUMADAS', detalhamentos: [
      {
        codigo: '1.1.1', descricao: 'TUBOS E CONEXOES - ESGOTO - PAVIMENTO TIPO ( 1o AO 36o PAV )',
        unidade: 'SV', disciplina: 'ESGOTO', local: null,
        quantidade_contratada: 36, valor_unitario_contratual: 5000, valor_global_item: 180000,
        qtd_anterior: 4, valor_anterior: 20000, pct_anterior: 11.1,
        qtd_atual: 3, valor_atual: 15000, pct_atual: 8.3,
        qtd_total: 7, valor_total: 35000, pct_total: 19.4,
        qtd_saldo: 29, valor_saldo: 145000, pct_saldo: 80.6,
        material_atual: 9000, servico_atual: 6000,
        pavimentos_pct: { '1': 100, '2': 100, '3': 100, '4': 100, '5': 100, '6': 100, '7': 100 },
        pavimentos_pct_anterior: { '1': 100, '2': 100, '3': 100, '4': 100 },
        pct_prev_total: 22,
      },
      {
        codigo: '1.1.2', descricao: 'PRUMADA VERTICAL ( Dividida em vaos )',
        unidade: 'VÃO', disciplina: 'ELÉTRICA', local: null,
        quantidade_contratada: 48, valor_unitario_contratual: 2000, valor_global_item: 96000,
        qtd_anterior: 5, valor_anterior: 10000, pct_anterior: 10.4,
        qtd_atual: 2, valor_atual: 4000, pct_atual: 4.2,
        qtd_total: 7, valor_total: 14000, pct_total: 14.6,
        qtd_saldo: 41, valor_saldo: 82000, pct_saldo: 85.4,
        material_atual: 2500, servico_atual: 1500,
        pavimentos_pct: { '1': 100, '2': 100, '3': 100, '4': 100, '5': 100, '15': 100, '16': 100 },
        pavimentos_pct_anterior: { '1': 100, '2': 100, '3': 100, '4': 100, '5': 100 },
      },
      {
        codigo: '1.1.3', descricao: 'CAIXA DE INSPECAO', unidade: 'UN',
        disciplina: null, local: '3º PAV',
        quantidade_contratada: 2, valor_unitario_contratual: 1500, valor_global_item: 3000,
        qtd_anterior: 0, valor_anterior: 0, pct_anterior: 0,
        qtd_atual: 1, valor_atual: 1500, pct_atual: 50,
        qtd_total: 1, valor_total: 1500, pct_total: 50,
        qtd_saldo: 1, valor_saldo: 1500, pct_saldo: 50,
        material_atual: 1000, servico_atual: 500,
      },
    ],
  }],
}]

/**
 * Teste de ponta a ponta: gera o .xlsx de verdade, relê do disco e confere
 * abas, AutoFiltro e números. Cobre o que os testes puros não pegam — o
 * writer do xlsx-js-style, o range do filtro e o nome do arquivo.
 */
describe('exportarExcelMedicao', () => {
  it('gera o arquivo com as 3 abas, autofiltro e valores', async () => {
    const out = mkdtempSync(join(tmpdir(), 'medicao-xlsx-'))
    const cwd = process.cwd()
    process.chdir(out)
    try {
      await exportarExcelMedicao({
        medicao: {
          numero: 12, periodo_referencia: '2026-07', status: 'aprovado', tipo: 'mensal',
          solicitante_nome: 'Eng. Rocha', aprovador_nome: 'Admin',
          contrato: { numero: 'CT-001', descricao: 'Obra X', contratante: { nome: 'FIP' }, contratado: { nome: 'WAVE' } },
        },
        grupos,
        totais: {
          valor_global_total: 279000, valor_anterior_total: 30000, valor_atual_total: 20500,
          valor_total_medido: 50500, valor_saldo_total: 228500,
          pct_anterior_total: 10.7, pct_atual_total: 7.3, pct_total_medido: 18.1, pct_saldo_total: 81.9,
          material_atual_total: 12500, servico_atual_total: 8000,
        },
      })
    } finally {
      process.chdir(cwd)
    }
    try {
    const escrito = {
      nome: 'medicao-0012-2026-07-filtravel.xlsx',
      wb: XLSX.readFile(`${out}/medicao-0012-2026-07-filtravel.xlsx`),
    }

    expect(escrito.nome).toBe('medicao-0012-2026-07-filtravel.xlsx')
    expect(escrito.wb.SheetNames).toEqual(['Por Local', 'Itens', 'Resumo'])

    const local = escrito.wb.Sheets['Por Local']
    // 36 pavtos + 48 vãos + 1 item = 85 linhas + 3 de cabeçalho
    expect((local['!autofilter'] as { ref: string }).ref).toBe('A3:AH88')
    expect(local['A3'].v).toBe('Local')
    // Primeira linha de dados: 1º pav (ordenado por local)
    expect(local['A4'].v).toBe('1º pav')

    const linhas = XLSX.utils.sheet_to_json<Record<string, string | number>>(local, { range: 2 })
    expect(linhas).toHaveLength(85)
    // Filtrar pelo texto "3º pav" pega os itens com grade de pavimento...
    const terceiro = linhas.filter(l => l['Local'] === '3º pav')
    expect(terceiro.map(l => l['Disciplina'])).toEqual(['ESGOTO'])
    // ...e "Nº Local = 3" unifica as três nomenclaturas do 3º pavimento:
    // pavto ("3º pav"), vão tipo ("3T") e local contratual solto ("3º PAV").
    const nivel3 = linhas.filter(l => l['Nº Local'] === 3)
    expect(nivel3.map(l => l['Local']).sort()).toEqual(['3T', '3º PAV', '3º pav'])
    // A caixa de inspeção não tem disciplina própria — herda a do grupo.
    expect(nivel3.map(l => l['Disciplina']).sort()).toEqual(['ELÉTRICA', 'ESGOTO', 'HIDRÁULICA'])
    const itemLocal = linhas.find(l => l['Local'] === '3º PAV')!
    expect(itemLocal['Tipo de Local']).toBe('Item')

    const p5 = linhas.find(l => l['Local'] === '5º pav' && l['Código'] === '1.1.1')!
    expect(p5['% no Período (local)']).toBe(100)
    expect(p5['Valor no período (local)']).toBe(5000)

    const itens = XLSX.utils.sheet_to_json<Record<string, string | number>>(escrito.wb.Sheets['Itens'], { range: 2 })
    expect(itens).toHaveLength(3)
    expect(itens[0]['Locais medidos no período']).toBe('5º pav, 6º pav, 7º pav')
    expect(itens[1]['Locais medidos no período']).toBe('5T, 6T')
    expect(itens[0]['Desvio real−prev. (p.p.)']).toBeCloseTo(-2.6, 6)

    const resumo = XLSX.utils.sheet_to_json<unknown[]>(escrito.wb.Sheets['Resumo'], { header: 1, range: 2 })
    const flat = JSON.stringify(resumo)
    expect(flat).toContain('CT-001')
    expect(flat).toContain('Locais com medição no período')
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })
})
