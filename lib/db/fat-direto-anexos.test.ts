import { describe, it, expect } from 'vitest'
import {
  anexoStoragePath,
  mergeAnexos,
  prefixoAnexosPedido,
  sanitizarParaPersistir,
} from './fat-direto-anexos'

const SOL = '516c7a7e-9de2-4159-a925-52b309a6f10b'
const BASE = 'https://xyzabc.supabase.co/storage/v1/object/public/faturamento-direto'

function urlDe(arquivo: string): string {
  return `${BASE}/pedidos/${SOL}/${arquivo}`
}

describe('anexoStoragePath', () => {
  it('extrai o path a partir da URL pública do bucket', () => {
    expect(anexoStoragePath({ url: urlDe('1700000000000-pedido.pdf') }, SOL))
      .toBe(`pedidos/${SOL}/1700000000000-pedido.pdf`)
  })

  it('decodifica o percent-encoding da URL (nome com espaço/acento)', () => {
    const url = `${BASE}/pedidos/${SOL}/1700000000000-or%C3%A7amento%20final.pdf`
    expect(anexoStoragePath({ url }, SOL))
      .toBe(`pedidos/${SOL}/1700000000000-orçamento final.pdf`)
  })

  it('cai pro path derivado do nome quando não há URL (anexo legado pré-016)', () => {
    expect(anexoStoragePath({ nome: 'PEDIDO-FIP-0007.pdf' }, SOL))
      .toBe(`pedidos/${SOL}/PEDIDO-FIP-0007.pdf`)
  })

  it('usa o nome quando a URL não é do nosso bucket', () => {
    expect(anexoStoragePath({ url: 'https://exemplo.com/qualquer.pdf', nome: 'qualquer.pdf' }, SOL))
      .toBe(`pedidos/${SOL}/qualquer.pdf`)
  })

  it('devolve null sem url e sem nome', () => {
    expect(anexoStoragePath({}, SOL)).toBeNull()
    expect(anexoStoragePath(null, SOL)).toBeNull()
  })

  it('prefixoAnexosPedido é a pasta do pedido no bucket', () => {
    expect(prefixoAnexosPedido(SOL)).toBe(`pedidos/${SOL}`)
  })
})

describe('mergeAnexos', () => {
  it('não duplica o que já está registrado no pedido', () => {
    const registrado = { nome: 'pedido.pdf', url: urlDe('1700000000000-pedido.pdf'), tamanho: 1024, tipo: 'application/pdf' }
    const noBucket = { nome: '1700000000000-pedido.pdf', url: urlDe('1700000000000-pedido.pdf'), tamanho: 1024 }

    const { anexos, recuperados } = mergeAnexos([registrado], [noBucket], SOL)

    expect(recuperados).toBe(0)
    expect(anexos).toHaveLength(1)
    // Metadados do BANCO mandam — o Storage é só fonte de resgate.
    expect(anexos[0].nome).toBe('pedido.pdf')
    expect(anexos[0].origem).toBeUndefined()
  })

  it('resgata o órfão do bucket e o marca como origem storage', () => {
    // Cenário real do bug: o arquivo subiu pro Storage, o registro em
    // pedido_anexos morreu em "column does not exist" e o anexo sumiu da tela.
    const registrado = { nome: 'orcamento.pdf', url: urlDe('1700000000000-orcamento.pdf') }
    const orfao = { nome: '1700000000001-pedido-sienge.pdf', url: urlDe('1700000000001-pedido-sienge.pdf'), tamanho: 2048, tipo: 'application/pdf' }

    const { anexos, recuperados } = mergeAnexos([registrado], [registrado, orfao], SOL)

    expect(recuperados).toBe(1)
    expect(anexos).toHaveLength(2)
    // A ordem da lista do pedido é preservada; o resgatado entra no fim.
    expect(anexos[0].nome).toBe('orcamento.pdf')
    expect(anexos[0].origem).toBeUndefined()
    expect(anexos[1].nome).toBe('1700000000001-pedido-sienge.pdf')
    expect(anexos[1].origem).toBe('storage')
    expect(anexos[1].tamanho).toBe(2048)
  })

  it('lista do pedido vazia: tudo que está no bucket é resgatado', () => {
    const noBucket = [
      { nome: '1700000000000-a.pdf', url: urlDe('1700000000000-a.pdf') },
      { nome: '1700000000001-b.pdf', url: urlDe('1700000000001-b.pdf') },
    ]

    const { anexos, recuperados } = mergeAnexos([], noBucket, SOL)

    expect(recuperados).toBe(2)
    expect(anexos.map(a => a.origem)).toEqual(['storage', 'storage'])
  })

  it('aceita null/undefined nos dois lados', () => {
    expect(mergeAnexos(null, null, SOL)).toEqual({ anexos: [], recuperados: 0 })
    expect(mergeAnexos(undefined, undefined, SOL)).toEqual({ anexos: [], recuperados: 0 })
  })

  it('bucket vazio devolve a lista do pedido intacta', () => {
    const registrados = [
      { nome: 'a.pdf', url: urlDe('1700000000000-a.pdf') },
      { nome: 'b.pdf', url: urlDe('1700000000001-b.pdf') },
    ]

    const { anexos, recuperados } = mergeAnexos(registrados, [], SOL)

    expect(recuperados).toBe(0)
    expect(anexos.map(a => a.nome)).toEqual(['a.pdf', 'b.pdf'])
  })

  it('casa por storage path, NÃO por nome — mesmo arquivo enviado duas vezes conta duas vezes', () => {
    // O sign-pedido-upload prefixa o path com Date.now(); dois uploads do
    // mesmo arquivo têm nome idêntico e paths distintos. Casar por nome
    // esconderia o segundo upload.
    const registrado = { nome: 'pedido.pdf', url: urlDe('1700000000000-pedido.pdf') }
    const segundoUpload = { nome: 'pedido.pdf', url: urlDe('1700000000999-pedido.pdf') }

    const { anexos, recuperados } = mergeAnexos([registrado], [segundoUpload], SOL)

    expect(recuperados).toBe(1)
    expect(anexos).toHaveLength(2)
    expect(anexos[1].url).toBe(urlDe('1700000000999-pedido.pdf'))
  })

  it('anexo legado (sem url) casa pelo nome com o objeto do bucket', () => {
    // Pedidos pré-016 guardavam só pedido_pdf_nome; o path do objeto no
    // bucket é exatamente pedidos/{solId}/{nome}, então não pode duplicar.
    const legado = { nome: 'PEDIDO-FIP-0007.pdf', url: null }
    const noBucket = { nome: 'PEDIDO-FIP-0007.pdf', url: urlDe('PEDIDO-FIP-0007.pdf') }

    const { anexos, recuperados } = mergeAnexos([legado], [noBucket], SOL)

    expect(recuperados).toBe(0)
    expect(anexos).toHaveLength(1)
  })
})

describe('sanitizarParaPersistir', () => {
  it('descarta o campo derivado origem antes de gravar no banco', () => {
    const anexos = sanitizarParaPersistir([
      { nome: 'a.pdf', url: urlDe('1700000000000-a.pdf'), origem: 'storage' },
    ])
    expect(anexos[0]).not.toHaveProperty('origem')
    expect(anexos[0].nome).toBe('a.pdf')
  })
})
