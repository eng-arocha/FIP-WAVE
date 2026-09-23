import { describe, it, expect } from 'vitest'
import { parseSaldoColado, valorPtBr } from './saldo-colado'

const CAB = 'Documento\tInsumo\tEspecificação\tUnidade\tQtd.a Desc\tVlr. a Desc\tQtd.Desc\tVlr.Desc'

/** Recorte fiel da grade do ERP (26/08/2026, depois da medição 04). */
const DETALHADO = [
  CAB,
  'NF-e 198\t71635\tFaturamento direto  - ELÉTRICA SUBESTAÇÃO\tR$\t0,0000\t0,00\t5.261,8400\t5.261,84',
  'NF-e 534\t71635\tFaturamento direto  - ELÉTRICA SUBESTAÇÃO\tR$\t72.780,8100\t72.780,81\t0,0000\t0,00',
  'NF-e 232900\t71635\tFaturamento direto  - ESGOTO\tR$\t2.384,9800\t2.384,98\t32.699,1500\t32.699,15',
  'NF-e 213366\t71635\tFaturamento direto  - FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS\tR$\t58,2300\t58,23\t0,0000\t0,00',
  '\t\t\t\t\t75.224,02\t37.961,00\t37.960,99',
].join('\n')

const AGREGADO = [
  'Rótulos de Linha\tSoma de Vlr. a Desc',
  'Faturamento direto  - ÁGUA PLUVIAL\t375.254,16',
  'Faturamento direto  - ESGOTO\t413.942,67',
  'Total Geral\t789.196,83',
].join('\n')

describe('valorPtBr', () => {
  it('lê o formato do ERP', () => {
    expect(valorPtBr('515.299,66')).toBe(515299.66)
    expect(valorPtBr('R$ 1.234,00')).toBe(1234)
    expect(valorPtBr('(1.234,00)')).toBe(-1234)
    expect(valorPtBr('R$')).toBeNull()
    expect(valorPtBr('')).toBeNull()
  })
})

describe('parseSaldoColado — layout detalhado', () => {
  const lido = parseSaldoColado(DETALHADO)

  it('reconhece o formato e uma linha por nota', () => {
    expect(lido.formato).toBe('detalhado')
    expect(lido.notas).toHaveLength(4)
  })

  it('separa o número da nota para casar com o nosso lado', () => {
    const n534 = lido.notas.find(n => n.numeroNf === '534')!
    expect(n534.tipoDoc).toBe('NF-e')
    expect(n534.documento).toBe('NF-e 534')
    expect(n534.grupoCodigo).toBe('1')
    expect(n534.valorADescontar).toBe(72780.81)
    expect(n534.valorDescontado).toBe(0)
  })

  it('não confunde Vlr. a Desc com Vlr.Desc', () => {
    const n198 = lido.notas.find(n => n.numeroNf === '198')!
    expect(n198.valorADescontar).toBe(0)
    expect(n198.valorDescontado).toBe(5261.84)
  })

  it('a nota que está nos dois lados traz os dois valores', () => {
    const n = lido.notas.find(n => n.numeroNf === '232900')!
    expect(n.valorADescontar).toBe(2384.98)
    expect(n.valorDescontado).toBe(32699.15)
  })

  it('agrega por macro item — é o que a comparação consome', () => {
    const g1 = lido.linhas.find(l => l.grupoCodigo === '1')!
    expect(g1.valor).toBe(72780.81)
    expect(g1.valorDescontado).toBe(5261.84)
    expect(lido.total).toBe(75224.02)
    expect(lido.totalDescontado).toBe(37960.99)
  })

  it('lê a linha de totais sem tratá-la como nota', () => {
    expect(lido.totalInformado).toBe(75224.02)
    expect(lido.totalDescontadoInformado).toBe(37960.99)
    expect(lido.notas.every(n => n.documento !== '')).toBe(true)
  })

  it('resolve o grupo 19 pelo detalhamento, não pelo grupo', () => {
    const shaft = lido.notas.find(n => n.numeroNf === '213366')!
    expect(shaft.detalhamentoCodigo).toBe('19.1.2')
    expect(shaft.grupoCodigo).toBeNull()
  })

  it('funciona sem o cabeçalho colado', () => {
    const semCab = parseSaldoColado(DETALHADO.split('\n').slice(1).join('\n'))
    expect(semCab.formato).toBe('detalhado')
    expect(semCab.notas).toHaveLength(4)
    expect(semCab.notas.find(n => n.numeroNf === '198')!.valorDescontado).toBe(5261.84)
  })

  it('macro item desconhecido vira aviso, não erro', () => {
    const lido = parseSaldoColado([
      CAB,
      'NF-e 1\t71635\tFaturamento direto  - MACRO ITEM QUE NÃO EXISTE\tR$\t0,0000\t10,00\t0,0000\t0,00',
    ].join('\n'))
    expect(lido.notas).toHaveLength(1)
    expect(lido.naoReconhecidas.map(l => l.chave)).toEqual(['MACRO ITEM QUE NAO EXISTE'])
  })
})

describe('parseSaldoColado — layout agregado (compatibilidade)', () => {
  const lido = parseSaldoColado(AGREGADO)

  it('continua lendo a tabela dinâmica somada à mão', () => {
    expect(lido.formato).toBe('agregado')
    expect(lido.notas).toHaveLength(0)
    expect(lido.linhas).toHaveLength(2)
    expect(lido.total).toBe(789196.83)
    expect(lido.totalInformado).toBe(789196.83)
    expect(lido.linhas.every(l => l.valorDescontado === 0)).toBe(true)
  })

  it('não inventa formato detalhado a partir de duas colunas', () => {
    expect(parseSaldoColado('Faturamento direto  - ESGOTO\t413.942,67').formato).toBe('agregado')
  })
})

/**
 * A grade colada duas vezes.
 *
 * Aconteceu em produção: o retrato entrou com cada linha repetida. O total por
 * macro item sobreviveu — o reendereçamento pela nossa alocação limita cada
 * nota ao que ela cobre —, mas a conferência NOTA A NOTA soma as linhas cruas
 * e passou a acusar 196 divergências onde havia 13, cada nota com o dobro do
 * valor. Cabeçalho e linhas reais do export de 23/09/2026.
 */
describe('linha repetida na colagem', () => {
  const CAB = 'Centro\tNome do Centro de Negócio\tNº Pedido Centro Associado\tItem\tNº Entrada\tNº Devolução\tDocumento\tInsumo\tEspecificação\tUnidade\tQtd.a Desc\tVlr. a Desc\tQtd.Desc\tVlr.Desc\tNº Pedido Associado'
  const L1 = 'CBM.01.0002\tCondomínio Wave\t1139\t1\t158969/001\t\tNF-e 534\t71635\tFaturamento direto - ELÉTRICA SUBESTAÇÃO\tR$\t0,00\t7.280,00\t0,00\t72.780,81\t23797'
  const L2 = 'CBM.01.0002\tCondomínio Wave\t1139\t2\t154859/002\t\tNF-e 198\t71635\tFaturamento direto - GERAÇÃO\tR$\t0,00\t19.367,62\t0,00\t0,00\t23797'

  it('descarta a linha repetida e conta quantas', () => {
    const r = parseSaldoColado([CAB, L1, L2, L1, L2].join('\n'))
    expect(r.formato).toBe('detalhado')
    expect(r.notas).toHaveLength(2)
    expect(r.duplicadas).toBe(2)
    expect(r.total).toBeCloseTo(7_280.00 + 19_367.62, 2)
  })

  it('a mesma NF em entradas diferentes é rateio, não repetição', () => {
    // NF-e 534 aparece em dois itens do pedido — entradas distintas.
    const outraEntrada = L1.replace('158969/001', '158969/002').replace('7.280,00', '1.500,00')
    const r = parseSaldoColado([CAB, L1, outraEntrada].join('\n'))
    expect(r.notas).toHaveLength(2)
    expect(r.duplicadas).toBe(0)
    expect(r.total).toBeCloseTo(8_780.00, 2)
  })

  it('sem cabeçalho, cai na identidade da linha e ainda pega a repetição', () => {
    const semCab = 'NF-e 534\t71635\tFaturamento direto - ELÉTRICA SUBESTAÇÃO\tR$\t0,00\t7.280,00\t0,00\t72.780,81'
    const r = parseSaldoColado([semCab, semCab].join('\n'))
    expect(r.notas).toHaveLength(1)
    expect(r.duplicadas).toBe(1)
  })

  it('colagem limpa não acusa nada', () => {
    const r = parseSaldoColado([CAB, L1, L2].join('\n'))
    expect(r.duplicadas).toBe(0)
    expect(r.notas).toHaveLength(2)
  })
})

/**
 * `Vlr.Desc` colado como cópia de `Vlr. a Desc`.
 *
 * Aconteceu em produção: o retrato entrou com os dois campos idênticos em
 * todas as notas. A conferência nota a nota soma `a descontar + descontado`
 * para saber quanto a nota vale no ERP, e com a cópia toda nota passou a
 * valer o dobro — 196 divergências onde havia 13, cada "lá" exatamente 2× o
 * "aqui". Fisicamente as duas colunas nunca são iguais em tudo: uma é o que
 * falta descontar, a outra o que já foi consumido.
 */
describe('coluna Vlr.Desc colada como cópia', () => {
  const CAB = 'Documento\tInsumo\tEspecificação\tUnidade\tQtd.a Desc\tVlr. a Desc\tQtd.Desc\tVlr.Desc'
  const linha = (doc: string, grupo: string, a: string, d: string) =>
    `${doc}\t71635\tFaturamento direto - ${grupo}\tR$\t0,00\t${a}\t0,00\t${d}`

  const COLAPSADO = [
    CAB,
    linha('NF-e 850', 'ALIMENTAÇÃO ELÉTRICA', '419.682,57', '419.682,57'),
    linha('NF-e 836', 'ALIMENTAÇÃO ELÉTRICA', '332.018,91', '332.018,91'),
    linha('NF-e 557', 'GERAÇÃO', '257.377,25', '257.377,25'),
    linha('NF-e 198', 'ELÉTRICA SUBESTAÇÃO', '0,00', '0,00'),
    linha('NF-e 534', 'QUADROS ELÉTRICOS', '69.841,56', '69.841,56'),
  ].join('\n')

  it('detecta e descarta o "já descontado"', () => {
    const r = parseSaldoColado(COLAPSADO)
    expect(r.colunasColapsadas).toBe(true)
    expect(r.notas.every(n => n.valorDescontado === 0)).toBe(true)
    // O que importa — o lastro disponível — segue intacto.
    expect(r.total).toBeCloseTo(419_682.57 + 332_018.91 + 257_377.25 + 69_841.56, 2)
    expect(r.totalDescontado).toBe(0)
  })

  it('colagem correta não é tocada', () => {
    const bom = [
      CAB,
      linha('NF-e 850', 'ALIMENTAÇÃO ELÉTRICA', '419.682,57', '0,00'),
      linha('NF-e 198', 'ELÉTRICA SUBESTAÇÃO', '0,00', '5.261,84'),
      linha('NF-e 534', 'ELÉTRICA SUBESTAÇÃO', '0,00', '72.780,81'),
      linha('NF-e 557', 'GERAÇÃO', '257.377,25', '0,00'),
      linha('NF-e 2385', 'SISTEMA DE PROTEÇÃO CONTRA DESCARGA ATMOSFÉRICA', '7.280,00', '0,00'),
    ].join('\n')
    const r = parseSaldoColado(bom)
    expect(r.colunasColapsadas).toBe(false)
    expect(r.totalDescontado).toBeCloseTo(5_261.84 + 72_780.81, 2)
  })

  it('poucas notas não disparam o alarme', () => {
    // Duas notas sem nada descontado batem por acaso; não é sinal de coluna
    // faltando, e zerar seria perder dado bom.
    const r = parseSaldoColado([
      CAB,
      linha('NF-e 850', 'ALIMENTAÇÃO ELÉTRICA', '0,00', '0,00'),
      linha('NF-e 836', 'GERAÇÃO', '0,00', '0,00'),
    ].join('\n'))
    expect(r.colunasColapsadas).toBe(false)
  })
})

/**
 * Grade detalhada colada SEM TABULAÇÃO.
 *
 * Aconteceu em produção: o texto passou por algum lugar que comeu o TAB e
 * chegou como frase. Sem coluna, a leitura detalhada não acha cabeçalho nem
 * infere nada, o layout agregado assume, e cada LINHA DE DADOS inteira vira o
 * "rótulo de um macro item" — ~250 macro itens desconhecidos e um retrato
 * inútil gravado por cima do que estava bom.
 */
describe('colagem sem tabulação', () => {
  /** Linhas reais da grade do ERP, com os TABs trocados por espaço. */
  const SEM_TAB = [
    'Centro Nome do Centro de Negócio Nº Pedido Centro Associado Item Nº Entrada Nº Devolução Documento Insumo Especificação Unidade Qtd.a Desc Vlr. a Desc Qtd.Desc Vlr.Desc',
    'CBM.01.0002 Condomínio Wave - Custo de Construção 1139 1 154859/001 NF-e 198 71635 Faturamento direto - ELÉTRICA SUBESTAÇÃO R$ 0,0000 0,00 5.261,8400 5.261,84',
    'CBM.01.0002 Condomínio Wave - Custo de Construção 1139 1 158969/001 NF-e 534 71635 Faturamento direto - ELÉTRICA SUBESTAÇÃO R$ 72.780,8100 72.780,81 0,0000 0,00',
    'CBM.01.0002 Condomínio Wave - Custo de Construção 1201 3 161233/001 NF-e 2385 71635 Faturamento direto - SISTEMA DE PROTEÇÃO CONTRA DESCARGA ATMOSFÉRICA R$ 7.280,0000 7.280,00 0,0000 0,00',
    'CBM.01.0002 Condomínio Wave - Custo de Construção 1188 17 159410/001 NF-e 15400 71635 Faturamento direto - ADMINISTRAÇÃO OBRA R$ 220.000,0000 220.000,00 0,0000 0,00',
  ].join('\n')

  it('acusa a tabulação perdida em vez de fingir que é o layout agregado', () => {
    const r = parseSaldoColado(SEM_TAB)
    expect(r.tabulacaoPerdida).toBe(true)
  })

  it('a grade com TAB e a tabela somada seguem limpas', () => {
    expect(parseSaldoColado(DETALHADO).tabulacaoPerdida).toBe(false)
    expect(parseSaldoColado(AGREGADO).tabulacaoPerdida).toBe(false)
  })

  it('uma linha solta não derruba a colagem', () => {
    // O rodapé de um relatório pode trazer uma frase parecida; uma só não é
    // sinal de colagem estragada.
    const r = parseSaldoColado([
      'Faturamento direto  - ÁGUA PLUVIAL\t375.254,16',
      'NF-e 198 71635 Faturamento direto - ELÉTRICA SUBESTAÇÃO R$ 0,00 5.261,84',
      'Total Geral\t375.254,16',
    ].join('\n'))
    expect(r.tabulacaoPerdida).toBe(false)
  })
})

/**
 * Colagem que terminou em `Vlr. a Desc`, sem o par `Qtd.Desc | Vlr.Desc`.
 *
 * Foi o que entrou em produção às 20:55 de 23/09/2026: sobraram dois números
 * na cauda — `Qtd.a Desc` (4 decimais) e `Vlr. a Desc` (2 decimais) — que são
 * o MESMO valor, porque neste ERP a coluna Qtd. carrega reais. Lidos como
 * (a descontar, descontado), produziram 187 notas com as duas colunas iguais,
 * `total_descontado` um centavo acima do `total` (assinatura dos 4 decimais) e
 * 196 divergências falsas, cada "lá" valendo 2× o "aqui".
 */
describe('colagem sem o par Qtd.Desc / Vlr.Desc', () => {
  /** Sem cabeçalho, como veio: ... Documento, Insumo, Especificação, R$, Qtd.a Desc, Vlr. a Desc. */
  const linha = (doc: string, grupo: string, valor: string, valor4: string) =>
    `${doc}\t71635\tFaturamento direto  - ${grupo}\tR$\t${valor4}\t${valor}`

  const SEM_PAR = [
    linha('NF-e 534', 'ELÉTRICA SUBESTAÇÃO', '72.780,81', '72.780,8100'),
    linha('NF-e 2385', 'SISTEMA DE PROTEÇÃO CONTRA DESCARGA ATMOSFÉRICA', '7.280,00', '7.280,0000'),
    linha('NF-e 15400', 'ADMINISTRAÇÃO OBRA', '220.000,00', '220.000,0000'),
    linha('NF-e 850', 'ALIMENTAÇÃO ELÉTRICA', '419.682,57', '419.682,5700'),
    // Nota que o ERP já consumiu inteira: sem a coluna Vlr.Desc ela vem zerada.
    linha('NF-e 198', 'ELÉTRICA SUBESTAÇÃO', '0,00', '0,0000'),
  ].join('\n')

  const r = parseSaldoColado(SEM_PAR)

  it('não confunde Qtd.a Desc com o "já descontado"', () => {
    expect(r.formato).toBe('detalhado')
    expect(r.notas).toHaveLength(5)
    expect(r.notas.every(n => n.valorDescontado === 0)).toBe(true)
    expect(r.totalDescontado).toBe(0)
  })

  it('usa a coluna de 2 decimais como valor a descontar', () => {
    expect(r.total).toBeCloseTo(72_780.81 + 7_280 + 220_000 + 419_682.57, 2)
    expect(r.notas.find(n => n.numeroNf === '2385')?.valorADescontar).toBe(7_280)
  })

  it('avisa que a coluna do "já descontado" não veio', () => {
    expect(r.semColunaDescontado).toBe(true)
    // Não é cópia de coluna: é coluna ausente. Avisos diferentes.
    expect(r.colunasColapsadas).toBe(false)
  })

  it('a grade completa não dispara o aviso', () => {
    expect(parseSaldoColado(DETALHADO).semColunaDescontado).toBe(false)
  })
})

/**
 * A trava da coluna copiada não pode depender de unanimidade.
 *
 * No retrato real, 187 de 248 notas vieram idênticas e 61 estavam zeradas dos
 * dois lados — nota que o ERP já consumiu, sem valor a mostrar quando a coluna
 * `Vlr.Desc` não veio. Uma única nota zerada fazia o `every` passar.
 */
describe('coluna copiada em MAIORIA das notas', () => {
  const CAB = 'Documento\tInsumo\tEspecificação\tUnidade\tVlr. a Desc\tVlr.Desc'
  const linha = (doc: string, grupo: string, a: string, d: string) =>
    `${doc}\t71635\tFaturamento direto - ${grupo}\tR$\t${a}\t${d}`

  it('dispara com a maioria copiada e as demais zeradas', () => {
    const r = parseSaldoColado([
      CAB,
      linha('NF-e 850', 'ALIMENTAÇÃO ELÉTRICA', '419.682,57', '419.682,57'),
      linha('NF-e 836', 'ALIMENTAÇÃO ELÉTRICA', '332.018,91', '332.018,91'),
      linha('NF-e 557', 'GERAÇÃO', '257.377,25', '257.377,25'),
      linha('NF-e 534', 'QUADROS ELÉTRICOS', '69.841,56', '69.841,56'),
      linha('NF-e 198', 'ELÉTRICA SUBESTAÇÃO', '0,00', '0,00'),
      linha('NF-e 218', 'SPDA', '0,00', '0,00'),
    ].join('\n'))
    expect(r.colunasColapsadas).toBe(true)
    expect(r.totalDescontado).toBe(0)
  })

  it('uma coincidência isolada não condena a colagem', () => {
    // Nota com metade descontada ao centavo é raríssima, mas possível; uma só
    // entre várias corretas é coincidência, não cópia de coluna.
    const r = parseSaldoColado([
      CAB,
      linha('NF-e 850', 'ALIMENTAÇÃO ELÉTRICA', '419.682,57', '0,00'),
      linha('NF-e 198', 'ELÉTRICA SUBESTAÇÃO', '0,00', '5.261,84'),
      linha('NF-e 534', 'ELÉTRICA SUBESTAÇÃO', '0,00', '72.780,81'),
      linha('NF-e 557', 'GERAÇÃO', '257.377,25', '0,00'),
      linha('NF-e 2385', 'SPDA', '10.000,00', '10.000,00'),
    ].join('\n'))
    expect(r.colunasColapsadas).toBe(false)
    expect(r.totalDescontado).toBeCloseTo(5_261.84 + 72_780.81 + 10_000, 2)
  })
})
