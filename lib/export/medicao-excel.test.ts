import { describe, it, expect } from 'vitest'
import {
  resolverLocais,
  montarLinhasPorLocal,
  montarLinhasItens,
  numeroDoRotulo,
  compararCodigo,
  type ItemLike,
  type GrupoLike,
} from './medicao-excel'

function item(over: Partial<ItemLike> = {}): ItemLike {
  return {
    codigo: '1.1.1',
    descricao: 'ITEM GENERICO',
    quantidade_contratada: 1,
    valor_unitario_contratual: 1000,
    valor_global_item: 1000,
    qtd_anterior: 0, valor_anterior: 0, pct_anterior: 0,
    qtd_atual: 0, valor_atual: 0, pct_atual: 0,
    qtd_total: 0, valor_total: 0, pct_total: 0,
    qtd_saldo: 1, valor_saldo: 1000, pct_saldo: 100,
    material_atual: 0, servico_atual: 0,
    ...over,
  }
}

function arvore(itens: ItemLike[], over: Partial<GrupoLike> = {}): GrupoLike[] {
  return [{
    codigo: '1', nome: 'INSTALAÇÕES', disciplina: 'HIDRÁULICA',
    tarefas: [{ codigo: '1.1', nome: 'PRUMADAS', detalhamentos: itens }],
    ...over,
  }]
}

describe('numeroDoRotulo', () => {
  it('extrai o número inicial e ignora rótulos alfabéticos', () => {
    expect(numeroDoRotulo('3º pav')).toBe(3)
    expect(numeroDoRotulo('12T')).toBe(12)
    expect(numeroDoRotulo('SS2')).toBeNull()
    expect(numeroDoRotulo('Térreo')).toBeNull()
  })
})

describe('resolverLocais', () => {
  it('explode PAV TIPO no range da descrição', () => {
    const g = resolverLocais(item({
      descricao: 'TUBOS E CONEXOES - ESGOTO - PAVIMENTO TIPO ( 2o AO 36o PAV )',
      quantidade_contratada: 35,
    }))
    expect(g.tipo).toBe('Pavimento')
    expect(g.slots).toHaveLength(35)
    expect(g.slots[0]).toEqual({ chave: '2', rotulo: '2º pav', numero: 2 })
    expect(g.slots[34]).toEqual({ chave: '36', rotulo: '36º pav', numero: 36 })
  })

  it('usa os nomes de vão quando a grade é binária por vão', () => {
    const g = resolverLocais(item({
      descricao: 'PRUMADA VERTICAL ( Dividida em vaos )',
      quantidade_contratada: 48,
    }))
    expect(g.tipo).toBe('Vão')
    expect(g.slots[0]).toEqual({ chave: '1', rotulo: 'SS4', numero: null })
    expect(g.slots.find(s => s.rotulo === '3T')?.numero).toBe(3)
  })

  it('não numera meses — ordinal de tempo não pode filtrar como pavimento', () => {
    const g = resolverLocais(item({
      descricao: 'ADMINISTRAÇÃO OBRA ( MÊS )',
      quantidade_contratada: 17,
    }))
    expect(g.tipo).toBe('Mês')
    expect(g.slots).toHaveLength(17)
    expect(g.slots.every(s => s.numero === null)).toBe(true)
  })

  it('cai nas chaves gravadas quando a descrição não bate com nenhuma grade', () => {
    const g = resolverLocais(item({
      descricao: 'ITEM LEGADO SEM PADRAO',
      quantidade_contratada: 10,
      pavimentos_pct: { '4': 100, '2': 50 },
    }))
    expect(g.tipo).toBe('Pavimento')
    expect(g.slots.map(s => s.rotulo)).toEqual(['2º pav', '4º pav'])
  })

  it('item sem grade vira uma linha só, rotulada pelo local contratual', () => {
    expect(resolverLocais(item({ local: '3º PAV' })).slots)
      .toEqual([{ chave: '', rotulo: '3º PAV', numero: 3 }])
    expect(resolverLocais(item()).slots)
      .toEqual([{ chave: '', rotulo: '(sem local)', numero: null }])
  })
})

describe('montarLinhasPorLocal', () => {
  const pavItem = item({
    codigo: '1.1.1',
    descricao: 'TUBOS E CONEXOES - ESGOTO - PAVIMENTO TIPO ( 1o AO 4o PAV )',
    quantidade_contratada: 4,
    valor_unitario_contratual: 1000,
    valor_global_item: 4000,
    pavimentos_pct: { '1': 100, '2': 100, '3': 50 },
    pavimentos_pct_anterior: { '1': 100, '2': 25 },
    qtd_anterior: 1.25, valor_anterior: 1250, pct_anterior: 31.25,
    qtd_atual: 1.25, valor_atual: 1250, pct_atual: 31.25,
    qtd_total: 2.5, valor_total: 2500, pct_total: 62.5,
    qtd_saldo: 1.5, valor_saldo: 1500, pct_saldo: 37.5,
    material_atual: 600, servico_atual: 400,
  })

  it('gera uma linha por pavimento com anterior/período/acumulado', () => {
    const linhas = montarLinhasPorLocal(arvore([pavItem]))
    expect(linhas).toHaveLength(4)
    const p2 = linhas.find(l => l.local === '2º pav')!
    expect(p2.pctAnterior).toBe(25)
    expect(p2.pctAcumulado).toBe(100)
    expect(p2.pctPeriodo).toBe(75)
    expect(p2.situacao).toBe('Medido no período')
    const p1 = linhas.find(l => l.local === '1º pav')!
    expect(p1.pctPeriodo).toBe(0)
    expect(p1.situacao).toBe('Medido antes')
    const p4 = linhas.find(l => l.local === '4º pav')!
    expect(p4.pctAcumulado).toBe(0)
    expect(p4.situacao).toBe('Não medido')
  })

  it('rateia contratado e valores pelo número de locais', () => {
    const linhas = montarLinhasPorLocal(arvore([pavItem]))
    const p3 = linhas.find(l => l.local === '3º pav')!
    expect(p3.valorContratadoLocal).toBe(1000)
    expect(p3.qtdContratadaLocal).toBe(1)
    expect(p3.valorPeriodoLocal).toBe(500)
    expect(p3.valorAcumuladoLocal).toBe(500)
  })

  it('a soma dos valores do período por local reconstitui o valor do item', () => {
    const linhas = montarLinhasPorLocal(arvore([pavItem]))
    const soma = linhas.reduce((a, l) => a + l.valorPeriodoLocal, 0)
    expect(soma).toBeCloseTo(pavItem.valor_atual, 6)
  })

  it('rateia material e serviço do período na proporção do Δ de cada local', () => {
    const linhas = montarLinhasPorLocal(arvore([pavItem]))
    // Δ total = 75 (pav 2) + 50 (pav 3) = 125
    const p2 = linhas.find(l => l.local === '2º pav')!
    const p3 = linhas.find(l => l.local === '3º pav')!
    expect(p2.materialPeriodoLocal).toBeCloseTo(600 * (75 / 125), 6)
    expect(p3.servicoPeriodoLocal).toBeCloseTo(400 * (50 / 125), 6)
    const somaMat = linhas.reduce((a, l) => a + l.materialPeriodoLocal, 0)
    expect(somaMat).toBeCloseTo(600, 6)
  })

  it('herda disciplina do ancestral mais próximo e repete a hierarquia', () => {
    const linhas = montarLinhasPorLocal(arvore([item({ disciplina: 'ELÉTRICA' }), item({ codigo: '1.1.2' })]))
    expect(linhas.find(l => l.codigo === '1.1.1')!.disciplina).toBe('ELÉTRICA')
    expect(linhas.find(l => l.codigo === '1.1.2')!.disciplina).toBe('HIDRÁULICA')
    expect(linhas[0].grupoNome).toBe('INSTALAÇÕES')
    expect(linhas[0].tarefaCodigo).toBe('1.1')
  })

  it('agrupa disciplinas diferentes sob o mesmo pavimento — o ponto do arquivo', () => {
    const esgoto = item({
      codigo: '1.1.1', descricao: 'ESGOTO - PAV TIPO ( 1o AO 3o PAV )',
      quantidade_contratada: 3, valor_global_item: 300,
      pavimentos_pct: { '3': 100 }, disciplina: 'ESGOTO',
    })
    const eletrica = item({
      codigo: '2.1.1', descricao: 'ELETRODUTOS - PAV TIPO ( 1o AO 3o PAV )',
      quantidade_contratada: 3, valor_global_item: 600,
      pavimentos_pct: { '3': 50 }, disciplina: 'ELÉTRICA',
    })
    const linhas = montarLinhasPorLocal(arvore([esgoto, eletrica]))
    const noTerceiro = linhas.filter(l => l.local === '3º pav')
    expect(noTerceiro.map(l => l.disciplina).sort()).toEqual(['ELÉTRICA', 'ESGOTO'])
    // Ordenação agrupa por local antes de por código.
    expect(linhas.slice(0, 2).every(l => l.local === '1º pav')).toBe(true)
  })

  it('item sem grade usa os percentuais do próprio item', () => {
    const linhas = montarLinhasPorLocal(arvore([item({
      local: 'TÉRREO',
      pct_anterior: 20, pct_atual: 30, pct_total: 50,
      valor_atual: 300, material_atual: 100, servico_atual: 200,
    })]))
    expect(linhas).toHaveLength(1)
    expect(linhas[0].local).toBe('TÉRREO')
    expect(linhas[0].tipoLocal).toBe('Item')
    expect(linhas[0].pctPeriodo).toBe(30)
    expect(linhas[0].pctAcumulado).toBe(50)
    expect(linhas[0].materialPeriodoLocal).toBe(100)
    expect(linhas[0].servicoPeriodoLocal).toBe(200)
  })

  it('exporta a grade cheia mesmo sem pcts nesta medição, usando o anterior', () => {
    const linhas = montarLinhasPorLocal(arvore([item({
      descricao: 'ESGOTO - PAV TIPO ( 1o AO 3o PAV )',
      quantidade_contratada: 3,
      pavimentos_pct: null,
      pavimentos_pct_anterior: { '1': 100 },
    })]))
    expect(linhas).toHaveLength(3)
    expect(linhas.find(l => l.local === '1º pav')!.pctAcumulado).toBe(100)
    expect(linhas.find(l => l.local === '1º pav')!.pctPeriodo).toBe(0)
  })
})

describe('montarLinhasItens', () => {
  it('resume os locais tocados no período e os concluídos', () => {
    const linhas = montarLinhasItens(arvore([item({
      descricao: 'ESGOTO - PAV TIPO ( 1o AO 4o PAV )',
      quantidade_contratada: 4,
      pavimentos_pct: { '1': 100, '2': 100, '3': 50 },
      pavimentos_pct_anterior: { '1': 100, '2': 25 },
      pct_atual: 31.25, pct_total: 62.5,
    })]))
    expect(linhas).toHaveLength(1)
    expect(linhas[0].locaisNoPeriodo).toBe('2º pav, 3º pav')
    expect(linhas[0].qtdLocaisNoPeriodo).toBe(2)
    expect(linhas[0].locaisConcluidos).toBe(2)
    expect(linhas[0].totalLocais).toBe(4)
    expect(linhas[0].situacao).toBe('Medido no período')
  })

  it('calcula o desvio contra o previsto quando há cronograma', () => {
    const [comPrev, semPrev] = montarLinhasItens(arvore([
      item({ codigo: '1.1.1', pct_total: 60, pct_prev_total: 75 }),
      item({ codigo: '1.1.2', pct_total: 60 }),
    ]))
    expect(comPrev.desvio).toBeCloseTo(-15, 6)
    expect(semPrev.desvio).toBeNull()
    expect(semPrev.pctPrevistoTotal).toBeNull()
  })

  it('ordena por código hierárquico', () => {
    const linhas = montarLinhasItens(arvore([
      item({ codigo: '1.1.10' }), item({ codigo: '1.1.2' }), item({ codigo: '1.1.1' }),
    ]))
    expect(linhas.map(l => l.codigo)).toEqual(['1.1.1', '1.1.2', '1.1.10'])
  })
})

describe('compararCodigo', () => {
  it('compara segmento a segmento numericamente', () => {
    expect(compararCodigo('1.10', '1.2')).toBeGreaterThan(0)
    expect(compararCodigo('1.2', '1.2.1')).toBeLessThan(0)
  })
})
