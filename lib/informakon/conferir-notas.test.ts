import { describe, it, expect } from 'vitest'
import { conferirNotas, normalizarNumeroNota, type NotaDoErp, type NotaDoSistema, detectarNumerosRepetidos } from './conferir-notas'

const nossa = (numero: string, valorAlocado: number, data = '2026-08-01'): NotaDoSistema => ({
  id: `id-${numero}`, numero, data, emitente: 'Fornecedor X', valorAlocado,
  status: 'aprovada', arquivoUrl: null,
})

const noErp = (chave: string, numero: string, a: number, d: number, macroItem = 'MACRO'): NotaDoErp => ({
  chave, documento: `NF-e ${numero}`, numeroNf: numero, macroItem,
  valorADescontar: a, valorDescontado: d,
})

describe('normalizarNumeroNota', () => {
  it('iguala as formas em que a mesma nota aparece', () => {
    expect(normalizarNumeroNota('NF-e 534')).toBe('534')
    expect(normalizarNumeroNota('0000534')).toBe('534')
    expect(normalizarNumeroNota('534')).toBe('534')
    expect(normalizarNumeroNota('')).toBe('')
    expect(normalizarNumeroNota(null)).toBe('')
  })
})

describe('conferirNotas', () => {
  it('aponta a nota que não está lançada no ERP', () => {
    const r = conferirNotas({
      chave: '14',
      falta: 5000,
      nossas: [nossa('100', 10000), nossa('200', 5000)],
      erp: [noErp('14', '100', 10000, 0)],
    })
    expect(r.naoLancadas.map(l => l.numero)).toEqual(['200'])
    expect(r.totalNaoLancado).toBe(5000)
    expect(r.explicaFalta).toBe(true)
  })

  it('não marca como não lançada a nota que o ERP já descontou', () => {
    const r = conferirNotas({
      chave: '14',
      nossas: [nossa('100', 10000)],
      erp: [noErp('14', '100', 0, 10000)],
    })
    expect(r.linhas[0].situacao).toBe('ja_descontada')
    expect(r.naoLancadas).toHaveLength(0)
    expect(r.totalJaDescontado).toBe(10000)
  })

  it('separa a nota parcialmente descontada', () => {
    const r = conferirNotas({
      chave: '9',
      nossas: [nossa('232900', 35084.13)],
      erp: [noErp('9', '232900', 2384.98, 32699.15)],
    })
    expect(r.linhas[0].situacao).toBe('parcial')
    expect(r.totalDisponivel).toBe(2384.98)
    expect(r.totalJaDescontado).toBe(32699.15)
  })

  it('detecta a nota lançada no macro item errado — não é nota faltando', () => {
    const r = conferirNotas({
      chave: '14',
      falta: 3000,
      nossas: [nossa('300', 3000)],
      erp: [noErp('10', '300', 3000, 0, 'HIDRAULICA')],
    })
    expect(r.foraDoMacroItem.map(l => l.numero)).toEqual(['300'])
    expect(r.foraDoMacroItem[0].macroItemNoErp).toBe('HIDRAULICA')
    expect(r.naoLancadas).toHaveLength(0)
    expect(r.explicaFalta).toBe(false)
  })

  it('casa pelo número, não pelo valor — rateio diferente não é divergência', () => {
    const r = conferirNotas({
      chave: '14',
      nossas: [nossa('400', 1000)],
      erp: [noErp('14', '400', 700, 0)],
    })
    expect(r.linhas[0].situacao).toBe('disponivel')
    expect(r.naoLancadas).toHaveLength(0)
  })

  it('lista a nota que só existe no ERP', () => {
    const r = conferirNotas({
      chave: '14',
      nossas: [nossa('100', 1000)],
      erp: [noErp('14', '100', 1000, 0), noErp('14', '999', 500, 0)],
    })
    expect(r.soNoErp.map(n => n.numero)).toEqual(['999'])
  })

  it('soma as nossas linhas repetidas do mesmo número uma vez só', () => {
    const r = conferirNotas({
      chave: '14',
      nossas: [nossa('500', 600), nossa('500', 400)],
      erp: [],
    })
    expect(r.naoLancadas).toHaveLength(1)
    expect(r.totalNaoLancado).toBe(1000)
    expect(r.naoLancadas[0].notas).toHaveLength(2)
  })

  it('ordena ação primeiro e maior valor no topo', () => {
    const r = conferirNotas({
      chave: '14',
      nossas: [nossa('1', 100), nossa('2', 900), nossa('3', 5000)],
      erp: [noErp('14', '3', 5000, 0)],
    })
    expect(r.linhas.map(l => l.numero)).toEqual(['2', '1', '3'])
  })

  it('só afirma que explica a falta quando os números fecham', () => {
    const base = { chave: '14', nossas: [nossa('7', 1000)], erp: [] as NotaDoErp[] }
    expect(conferirNotas({ ...base, falta: 1000 }).explicaFalta).toBe(true)
    expect(conferirNotas({ ...base, falta: 1000.5 }).explicaFalta).toBe(true)
    expect(conferirNotas({ ...base, falta: 4000 }).explicaFalta).toBe(false)
    expect(conferirNotas({ ...base, falta: 0 }).explicaFalta).toBe(false)
  })

  it('ignora nota sem número em vez de casar tudo com tudo', () => {
    const r = conferirNotas({
      chave: '14',
      nossas: [{ ...nossa('', 800) }],
      erp: [noErp('14', '', 800, 0)],
    })
    expect(r.linhas).toHaveLength(0)
    expect(r.soNoErp).toHaveLength(0)
  })
})

/**
 * Número repetido — o caso NF 550 e a armadilha da NF 91.
 *
 * Os dois lados só têm o número em comum, então `NF-e 550` e `NFS-e 550` viram
 * um "550" só e são somados. Na Medição 5 isso fez o ERP mostrar R$ 29.500
 * para a NF 91 (soma de dois prestadores), o ajuste entrou errado e precisou do
 * manual-fix 087 para voltar.
 */
describe('detectarNumerosRepetidos', () => {
  it('pega dois documentos diferentes com o mesmo número no ERP', () => {
    const colisoes = detectarNumerosRepetidos(
      [
        { numeroNf: '550', documento: 'NFS-e 550', valor: 12_560 },
        { numeroNf: '550', documento: 'NF-e 550', valor: 39_140.57 },
        { numeroNf: '2385', documento: 'NF-e 2385', valor: 7_280 },
      ],
      [{ numeroNf: '550', pedido: 'FIP-1085' }, { numeroNf: '2385', pedido: 'FIP-1201' }],
    )
    expect([...colisoes.keys()]).toEqual(['550'])
    // Maior valor primeiro: é o documento que provavelmente falta cadastrar.
    expect(colisoes.get('550')!.docsErp).toEqual([
      { documento: 'NF-e 550', valor: 39_140.57 },
      { documento: 'NFS-e 550', valor: 12_560 },
    ])
  })

  it('pega o mesmo número em dois pedidos nossos', () => {
    // Prestadores diferentes, cada um com a própria sequência de NFS-e.
    const colisoes = detectarNumerosRepetidos(
      [{ numeroNf: '91', documento: 'NFS-e 91', valor: 29_500 }],
      [{ numeroNf: '91', pedido: 'FIP-1140' }, { numeroNf: '91', pedido: 'FIP-1177' }],
    )
    expect(colisoes.get('91')?.pedidosAqui).toEqual(['FIP-1140', 'FIP-1177'])
  })

  it('a mesma nota rateada em vários macro itens NÃO é colisão', () => {
    // A NF-e 206 aparece em sete macro itens do ERP — mesmo documento, várias
    // linhas. Acusar colisão aí encheria a tela de ruído.
    const colisoes = detectarNumerosRepetidos(
      [
        { numeroNf: '206', documento: 'NF-e 206', valor: 0 },
        { numeroNf: '206', documento: 'NF-e 206', valor: 1_000 },
        { numeroNf: '206', documento: 'NF-e 206', valor: 500 },
      ],
      [{ numeroNf: '206', pedido: 'FIP-1085' }, { numeroNf: '206', pedido: 'FIP-1085' }],
    )
    expect(colisoes.size).toBe(0)
  })
})
