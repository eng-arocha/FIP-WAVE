import { describe, it, expect } from 'vitest'
import {
  normalizar,
  extrairMacroItem,
  resolverDePara,
  parseDocumento,
  toNumero,
  toData,
  extrairReferenciaDoNome,
  acharCabecalho,
  parseGlobal,
  parseMedicao,
  parseMedicoesServico,
  parseNfsWaveGlobal,
  resolverFornecedores,
  parseRelatorio,
  type NfLinha,
  type LancamentoWave,
} from './parser'

// Cabeçalhos reproduzidos do relatório real de 28/07/2026, com os acentos e o
// "Nº" como o Informakon exporta.
const CAB_GLOBAL = [
  'Centro', 'Nome do Centro de Negócio', 'Nº Pedido Centro Associado', 'Item',
  'Nº Entrada', 'Nº Devolução', 'Documento', 'Insumo', 'Especificação',
  'Unidade', 'Qtd.a Desc', 'Vlr. a Desc', 'Qtd.Desc', 'Vlr.Desc', 'Nº Pedido Associado',
]
const linhaGlobal = (entrada: string, doc: string, espec: string, aDesc: number, desc: number) =>
  ['CBM.01.0002', 'Condomínio Wave', 1139, 1, entrada, null, doc, 71635,
    `Faturamento direto  - ${espec}`, 'R$', 0, aDesc, 0, desc, 23797]

const CAB_MED = [
  'Centro', 'Nome do Centro de Negócio', 'Item', 'Nº Entrada', 'Nº Devolução',
  'Documento', 'Insumo', 'Especificação', 'Unidade', 'Qtde.aDesc', 'Vlr.aDesc',
  '% Desc', 'Quantidade D', 'Valor D',
]
const linhaMed = (entrada: string, doc: string, espec: string, aDesc: number, pct: number, desc: number) =>
  ['CBM.01.0002', 'Condomínio Wave', 1, entrada, null, doc, 71635,
    `Faturamento direto  - ${espec}`, 'R$', aDesc, aDesc, pct, desc, desc]

describe('normalizar', () => {
  it('remove acentos, o indicador ordinal e colapsa espaço', () => {
    expect(normalizar('  Nº   Documento ')).toBe('N DOCUMENTO')
    expect(normalizar('Especificação')).toBe('ESPECIFICACAO')
    expect(normalizar('HIDRÁULICA')).toBe('HIDRAULICA')
    expect(normalizar(null)).toBe('')
  })
})

describe('extrairMacroItem', () => {
  it('tira o prefixo com um ou dois espaços', () => {
    expect(extrairMacroItem('Faturamento direto  - HIDRÁULICA')).toBe('HIDRAULICA')
    expect(extrairMacroItem('Faturamento direto - ESGOTO')).toBe('ESGOTO')
    expect(extrairMacroItem('Faturamento direto  -  GERAÇÃO')).toBe('GERACAO')
  })

  it('mantém hífens que fazem parte do nome do macro item', () => {
    expect(extrairMacroItem('Faturamento direto  - LÓGICA (DADOS E VOZ) - INFRA SECA'))
      .toBe('LOGICA (DADOS E VOZ) - INFRA SECA')
  })
})

describe('resolverDePara', () => {
  it('mapeia macro item para grupo', () => {
    expect(resolverDePara('HIDRAULICA')).toEqual({ grupo: '10' })
    expect(resolverDePara('COMBATE AO INCENDIO')).toEqual({ grupo: '14' })
  })

  it('mapeia os dois itens do grupo 19 para detalhamento, não para grupo', () => {
    expect(resolverDePara('ADMINISTRACAO OBRA')).toEqual({ detalhamento: '19.1.1' })
    expect(resolverDePara('FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS')).toEqual({ detalhamento: '19.1.2' })
  })

  it('devolve vazio para macro item desconhecido em vez de chutar', () => {
    expect(resolverDePara('ALGO QUE NAO EXISTE')).toEqual({})
  })
})

describe('parseDocumento', () => {
  it('separa tipo e número', () => {
    expect(parseDocumento('NF-e 115581')).toEqual({ documento: 'NF-e 115581', tipo: 'NF-e', numero: '115581' })
    expect(parseDocumento('NFS-e 705')).toEqual({ documento: 'NFS-e 705', tipo: 'NFS-e', numero: '705' })
  })

  it('não confunde NFS-e com NF-e', () => {
    expect(parseDocumento('NFS-e 4').tipo).toBe('NFS-e')
    expect(parseDocumento('NF-e 4').tipo).toBe('NF-e')
  })

  it('tolera vazio', () => {
    expect(parseDocumento(null)).toEqual({ documento: '', tipo: null, numero: null })
  })
})

describe('toNumero', () => {
  it('aceita number direto', () => {
    expect(toNumero(1234.56)).toBe(1234.56)
  })

  it('aceita texto no formato BR', () => {
    expect(toNumero('1.234,56')).toBe(1234.56)
    expect(toNumero('R$ 424.613,03')).toBe(424613.03)
    expect(toNumero('19,36%')).toBe(19.36)
  })

  it('aceita texto no formato US', () => {
    expect(toNumero('1234.56')).toBe(1234.56)
  })

  it('devolve 0 para vazio e lixo em vez de NaN', () => {
    expect(toNumero(null)).toBe(0)
    expect(toNumero('')).toBe(0)
    expect(toNumero('abc')).toBe(0)
  })
})

describe('toData', () => {
  it('aceita Date, ISO e BR', () => {
    expect(toData(new Date(Date.UTC(2026, 6, 20)))).toBe('2026-07-20')
    expect(toData('2026-07-20 00:00:00')).toBe('2026-07-20')
    expect(toData('20/07/2026')).toBe('2026-07-20')
    expect(toData(null)).toBeNull()
  })
})

describe('extrairReferenciaDoNome', () => {
  it('lê a data do nome do arquivo', () => {
    expect(extrairReferenciaDoNome('Controle_FIP_INFORMAKON_28JUL26.xlsx')).toBe('2026-07-28')
    expect(extrairReferenciaDoNome('controle 01mar26.xlsx')).toBe('2026-03-01')
  })

  it('devolve null quando o nome não tem data, para o banco aplicar CURRENT_DATE', () => {
    expect(extrairReferenciaDoNome('relatorio.xlsx')).toBeNull()
    expect(extrairReferenciaDoNome('')).toBeNull()
  })

  it('rejeita data que não existe no calendário', () => {
    expect(extrairReferenciaDoNome('x_31FEV26.xlsx')).toBeNull()
    expect(extrairReferenciaDoNome('x_31ABR26.xlsx')).toBeNull()
    expect(extrairReferenciaDoNome('x_29FEV24.xlsx')).toBe('2024-02-29')
  })
})

describe('acharCabecalho', () => {
  it('encontra o cabeçalho quando ele não está na primeira linha', () => {
    const aoa = [['', '', 'Material', ''], CAB_MED, linhaMed('1/1', 'NF-e 9', 'ESGOTO', 10, 100, 10)]
    const cab = acharCabecalho(aoa, ['ENTRADA', 'DOCUMENTO', 'ESPECIFICACAO'])
    expect(cab?.linha).toBe(1)
    expect(cab?.indice('Documento')).toBe(5)
  })

  it('devolve null quando as colunas obrigatórias não existem', () => {
    expect(acharCabecalho([['a', 'b']], ['ENTRADA', 'DOCUMENTO', 'ESPECIFICACAO'])).toBeNull()
  })

  it('prefere igualdade exata a "contém"', () => {
    // 'Item' existe exato na coluna 3; 'Nº Pedido Centro Associado' também
    // contém a palavra, mas vem antes.
    const cab = acharCabecalho([CAB_GLOBAL], ['ENTRADA', 'DOCUMENTO', 'ESPECIFICACAO'])
    expect(cab?.indice('Item')).toBe(3)
  })
})

describe('parseGlobal', () => {
  it('lê linhas e resolve o de-para', () => {
    const aoa = [
      CAB_GLOBAL,
      linhaGlobal('155645/001', 'NF-e 115581', 'ALIMENTAÇÃO ELÉTRICA', 0, 35609.16),
      linhaGlobal('157040/001', 'NFS-e 87', 'ADMINISTRAÇÃO OBRA', 0, 16000),
      linhaGlobal('999999/001', 'NF-e 1', 'PISCINA E SPA', 23643.6, 0),
    ]
    const r = parseGlobal(aoa)
    expect(r).toHaveLength(3)
    expect(r[0]).toMatchObject({
      entrada: '155645/001', numero_nf: '115581', tipo_doc: 'NF-e',
      grupo_codigo: '3', detalhamento_codigo: null, valor_descontado: 35609.16,
    })
    expect(r[1]).toMatchObject({ grupo_codigo: null, detalhamento_codigo: '19.1.1' })
    expect(r[2]).toMatchObject({ valor_a_descontar: 23643.6, valor_descontado: 0 })
  })

  it('ignora linhas sem entrada (totais e linhas em branco)', () => {
    const aoa = [CAB_GLOBAL, linhaGlobal('1/1', 'NF-e 9', 'ESGOTO', 0, 10), [null, null, null, null, null]]
    expect(parseGlobal(aoa)).toHaveLength(1)
  })

  it('falha com mensagem clara quando o cabeçalho não é reconhecido', () => {
    expect(() => parseGlobal([['a', 'b', 'c']])).toThrow(/cabeçalho não encontrado/)
  })
})

describe('parseMedicao', () => {
  it('extrai o número da medição do nome da aba', () => {
    const aoa = [['', '', 'Material'], CAB_MED, linhaMed('155645/001', 'NF-e 115581', 'ESGOTO', 25000, 96.97, 24242.07)]
    const r = parseMedicao(aoa, 'med 4')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      medicao_numero: 4, entrada: '155645/001', grupo_codigo: '9',
      percentual_desc: 96.97, valor_descontado: 24242.07,
    })
  })

  it('recusa aba sem número em vez de gravar medição 0', () => {
    expect(() => parseMedicao([CAB_MED], 'resumo')).toThrow(/número da medição/)
  })
})

describe('parseMedicoesServico', () => {
  const CAB = [
    '', 'Nº Medição', 'Data', 'I', 'Nº Contrato', 'Tp', 'Objeto', 'Prestador',
    'Nome do Prestador de Serviço', 'Observação', 'Observação Interna',
    '(+) Valor Contratual Medido', '(-) Material Fornecido', 'Valor Contratual Líquido',
    '(+) Valor do Reajuste', 'Valor da Medição', '(-) Descontos Diversos',
    '(-) Impostos Retidos', '(-) Retenção', 'Valor a Pagar', 'Nº AR', 'Data do AR',
    'Data do Documento', 'Data de Entrada', 'Tipo Doc.', 'Nº Documento',
  ]
  const linha = (obs: string | null, numDoc: string) => [
    null, 3378, '2026-07-20', 'A', 1382, 'C', 'INSTALAÇÕES FIP', '008189',
    'WAVE INSTALACOES SPE LTDA', obs, 'PERÍODO', 805522.67, 424613.03, 380909.64,
    0, 380909.64, 2.45, 0, 40276.13, 340631.06, 3657, '2026-07-28',
    '2026-07-27', '2026-07-28', 'NFS-e', numDoc,
  ]

  it('lê o fechamento do Informakon', () => {
    const r = parseMedicoesServico([['', 'Medições'], CAB, ['Centro: CBM010002'], linha('MED 04', '4')])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      numero_informakon: 3378, medicao_numero: 4, data_medicao: '2026-07-20',
      valor_contratual: 805522.67, valor_material: 424613.03,
      retencao: 40276.13, valor_a_pagar: 340631.06, numero_documento: '4',
    })
  })

  it('cai no nº da NFS-e quando a observação vem vazia', () => {
    // Foi o caso da MED 03 no relatório de 28/07/2026.
    const r = parseMedicoesServico([['', 'Medições'], CAB, linha(null, '3')])
    expect(r[0].rotulo).toBeNull()
    expect(r[0].medicao_numero).toBe(3)
  })

  it('ignora a linha de agrupamento do centro de negócio', () => {
    const r = parseMedicoesServico([['', 'Medições'], CAB, ['Centro: CBM010002 - Condomínio'], linha('MED 04', '4')])
    expect(r).toHaveLength(1)
  })
})

describe('resolverFornecedores', () => {
  const nf = (entrada: string, numero: string, desc: number, tipo = 'NF-e'): NfLinha => ({
    entrada, documento: `${tipo} ${numero}`, numero_nf: numero, tipo_doc: tipo,
    pedido: null, item_pedido: null, macro_item: 'ESGOTO', grupo_codigo: '9',
    detalhamento_codigo: null, valor_descontado: desc, valor_a_descontar: 0,
  })
  const lanc = (numero: string, cod: string, nome: string, valor: number, tipo = 'NF-e'): LancamentoWave => ({
    tipo_doc: tipo, numero_documento: numero, fornecedor_codigo: cod, fornecedor_nome: nome, valor,
  })

  it('resolve quando só existe um fornecedor com aquele número', () => {
    const r = resolverFornecedores([nf('1/1', '123', 500)], [lanc('123', '001', 'ACME', 500)])
    expect(r.get('1/1')).toEqual({ codigo: '001', nome: 'ACME', metodo: 'nome_unico' })
  })

  it('desempata pelo valor da linha quando duas notas dividem o número', () => {
    // NFS-e é numerada por prestador — o mesmo número existe em fornecedores
    // diferentes. Foi o caso das NFS-e 87 e 90 de administração de obra.
    const r = resolverFornecedores(
      [nf('a/1', '87', 16000, 'NFS-e'), nf('b/1', '87', 13500, 'NFS-e')],
      [lanc('87', '001', 'J MAURICIO', 16000, 'NFS-e'), lanc('87', '002', 'MARCELO', 13500, 'NFS-e')],
    )
    expect(r.get('a/1')).toMatchObject({ codigo: '001', metodo: 'valor_linha' })
    expect(r.get('b/1')).toMatchObject({ codigo: '002', metodo: 'valor_linha' })
  })

  it('usa a soma quando a nota foi rateada em vários macro itens', () => {
    // NF-e 115581 apareceu em ALIMENTAÇÃO ELÉTRICA e ESGOTO; nenhuma das duas
    // linhas bate sozinha com o lançamento de 60.609,16.
    const r = resolverFornecedores(
      [nf('a/1', '115581', 35609.16), nf('a/3', '115581', 25000)],
      [lanc('115581', '001', 'ACME', 60609.16), lanc('115581', '002', 'OUTRO', 999)],
    )
    expect(r.get('a/1')).toMatchObject({ codigo: '001', metodo: 'valor_agregado' })
    expect(r.get('a/3')).toMatchObject({ codigo: '001', metodo: 'valor_agregado' })
  })

  it('marca como ambíguo em vez de escolher um fornecedor arbitrário', () => {
    const r = resolverFornecedores(
      [nf('a/1', '50', 100)],
      [lanc('50', '001', 'UM', 999), lanc('50', '002', 'DOIS', 888)],
    )
    expect(r.get('a/1')).toEqual({ codigo: null, nome: null, metodo: 'ambiguo' })
  })

  it('colapsa as grafias duplicadas do mesmo fornecedor', () => {
    // O mesmo Carmehil está cadastrado três vezes no Informakon, com código
    // diferente em cada uma. Para o contrato é um fornecedor só.
    const r = resolverFornecedores(
      [nf('a/1', '77', 100)],
      [lanc('77', '001', 'Carmehil Comercial Elétrica Ltda', 100),
       lanc('77', '009', 'CARMEHIL - COMERCIAL ELETRICA LTDA', 100),
       lanc('77', '012', 'Carmehil Comercial Elétrica Ltda - Network', 100)],
    )
    expect(r.get('a/1')?.metodo).toBe('nome_unico')
  })

  it('continua ambíguo quando os fornecedores são realmente diferentes', () => {
    const r = resolverFornecedores(
      [nf('a/1', '201', 100)],
      [lanc('201', '001', 'EXPRESSION COM.DE MATERIAL DE CONSTRUCAO LTDA', 555),
       lanc('201', '002', 'FIP ENGENHARIA ELETRICA LTDA', 777)],
    )
    expect(r.get('a/1')?.metodo).toBe('ambiguo')
  })
})

describe('parseRelatorio', () => {
  const abas = () => [
    {
      nome: 'faturamento direto global',
      aoa: [CAB_GLOBAL,
        linhaGlobal('155645/001', 'NF-e 115581', 'ALIMENTAÇÃO ELÉTRICA', 0, 35609.16),
        linhaGlobal('157040/001', 'NFS-e 87', 'ADMINISTRAÇÃO OBRA', 1000, 16000)],
    },
    {
      nome: 'med 4',
      aoa: [['', '', 'Material'], CAB_MED,
        linhaMed('155645/001', 'NF-e 115581', 'ALIMENTAÇÃO ELÉTRICA', 35609.16, 100, 35609.16)],
    },
  ]

  it('soma os totais e classifica as abas', () => {
    const r = parseRelatorio(abas())
    expect(r.totais).toEqual({
      qtd_linhas: 2, total_nf: 52609.16, total_descontado: 51609.16, total_a_descontar: 1000,
    })
    expect(r.descontos).toHaveLength(1)
    expect(r.macroItensDesconhecidos).toEqual([])
  })

  it('avisa quando a aba de fornecedores não veio, sem quebrar', () => {
    const r = parseRelatorio(abas())
    expect(r.avisos.some(a => a.includes('NFS WAVE GLOBAL'))).toBe(true)
    expect(r.nfs[0].fornecedor_nome).toBeUndefined()
  })

  it('propaga o fornecedor para as abas de medição', () => {
    const comFornecedor = [...abas(), {
      nome: 'NFS WAVE GLOBAL',
      aoa: [['Nº AR', 'Data AR', 'Forn', 'Fornecedor', 'Nat', 'NatOpe', 'TpDoc.',
             'Nº Documento', 'Série', 'Complemento', 'Data Entrada', 'Data Doc.', 'Valor'],
            [1, null, '000123', 'ACME LTDA', 'SM', 11201, 'NF-e', '115581', '1', null, null, null, 35609.16],
            [2, null, '000456', 'J MAURICIO', 'SM', 19901, 'NFS-e', '87', 'E', null, null, null, 17000]],
    }]
    const r = parseRelatorio(comFornecedor)
    expect(r.fornecedoresAmbiguos).toBe(0)
    expect(r.nfs[0].fornecedor_nome).toBe('ACME LTDA')
    expect(r.descontos[0].fornecedor_nome).toBe('ACME LTDA')
  })

  it('reporta macro item desconhecido em vez de descartar em silêncio', () => {
    const r = parseRelatorio([{
      nome: 'faturamento direto global',
      aoa: [CAB_GLOBAL, linhaGlobal('1/1', 'NF-e 9', 'DISCIPLINA NOVA', 0, 10)],
    }])
    expect(r.macroItensDesconhecidos).toEqual(['DISCIPLINA NOVA'])
    expect(r.nfs[0].grupo_codigo).toBeNull()
  })

  it('recusa arquivo sem a aba de faturamento direto', () => {
    expect(() => parseRelatorio([{ nome: 'outra coisa', aoa: [['a']] }]))
      .toThrow(/faturamento direto global/)
  })
})
