import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Cobre o deadlock do fluxo de aprovação de encerramento de saldo.
 *
 * Aprovar é uma sequência de dois passos NÃO-atômicos: encerra o pedido e
 * depois marca a solicitação como 'aprovada'. Se o segundo passo falhar — ou
 * se um admin encerrar o pedido direto pelo modal, que não conhece esta fila —
 * o pedido fica 'encerrado' com a solicitação presa em 'pendente'. Antes, toda
 * nova tentativa de aprovar batia em 422 PEDIDO_NAO_APROVADO, sem saída pela
 * UI (foi o que travou o FIP-0912).
 */

const encerrarSolicitacaoMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))
vi.mock('./fat-direto', () => ({
  encerrarSolicitacao: (...args: unknown[]) => encerrarSolicitacaoMock(...args),
}))

const { decidirSolicitacaoEncerramento } = await import('./encerramento-saldo')

const ENC_ID = '11111111-1111-1111-1111-111111111111'
const PEDIDO_ID = '22222222-2222-2222-2222-222222222222'
const APROVADOR = '33333333-3333-3333-3333-333333333333'

/** Solicitação de encerramento pendente, como vem do banco. */
const encPendente = {
  id: ENC_ID,
  solicitacao_fat_direto_id: PEDIDO_ID,
  status: 'pendente',
  saldo_no_momento: 188.64,
  motivo_solicitacao: 'fornecedor confirmou que não emitirá mais NF',
}

/**
 * Stub do client Supabase. `statusPedido` controla em que estado o pedido está
 * quando a aprovação chega; `updatesEncerramento` coleta o que foi gravado.
 */
function montarClient(opts: {
  statusPedido: string
  deletado?: boolean
  devolucoesItens?: number[]
}) {
  const updatesEncerramento: any[] = []

  fromMock.mockImplementation((tabela: string) => {
    if (tabela === 'solicitacoes_encerramento_saldo') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: encPendente, error: null }),
          }),
        }),
        update: (payload: any) => {
          updatesEncerramento.push(payload)
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { ...encPendente, ...payload }, error: null }),
              }),
            }),
          }
        },
      }
    }
    if (tabela === 'solicitacoes_fat_direto') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: PEDIDO_ID,
                status: opts.statusPedido,
                deletado_em: opts.deletado ? '2026-01-01T00:00:00Z' : null,
              },
              error: null,
            }),
          }),
        }),
      }
    }
    if (tabela === 'itens_solicitacao_fat_direto') {
      return {
        select: () => ({
          eq: async () => ({
            data: (opts.devolucoesItens ?? []).map(v => ({ valor_devolvido: v })),
            error: null,
          }),
        }),
      }
    }
    throw new Error(`tabela inesperada: ${tabela}`)
  })

  return { updatesEncerramento }
}

beforeEach(() => {
  encerrarSolicitacaoMock.mockReset()
  fromMock.mockReset()
})

describe('decidirSolicitacaoEncerramento — aprovar', () => {
  it('pedido aprovado: encerra normalmente', async () => {
    montarClient({ statusPedido: 'aprovado' })
    encerrarSolicitacaoMock.mockResolvedValue({ saldo_devolvido: 188.64 })

    const r = await decidirSolicitacaoEncerramento({
      solicitacao_encerramento_id: ENC_ID,
      acao: 'aprovar',
      decidido_por_id: APROVADOR,
    })

    expect(encerrarSolicitacaoMock).toHaveBeenCalledOnce()
    expect(r.decisao).toBe('aprovada')
    expect(r.reconciliado).toBe(false)
  })

  it('pedido JÁ encerrado: reconcilia em vez de estourar 422', async () => {
    const { updatesEncerramento } = montarClient({
      statusPedido: 'encerrado',
      devolucoesItens: [100.0, 88.64],
    })

    const r = await decidirSolicitacaoEncerramento({
      solicitacao_encerramento_id: ENC_ID,
      acao: 'aprovar',
      decidido_por_id: APROVADOR,
    })

    // Não tenta encerrar de novo — era exatamente aí que dava 422.
    expect(encerrarSolicitacaoMock).not.toHaveBeenCalled()
    expect(r.decisao).toBe('aprovada')
    expect(r.reconciliado).toBe(true)
    expect(updatesEncerramento[0].status).toBe('aprovada')
    // Saldo apurado das devoluções reais dos itens, não do snapshot.
    expect(updatesEncerramento[0].saldo_efetivamente_cancelado).toBeCloseTo(188.64, 2)
  })

  it('pedido encerrado sem devoluções apuráveis: cai no snapshot saldo_no_momento', async () => {
    const { updatesEncerramento } = montarClient({
      statusPedido: 'encerrado',
      devolucoesItens: [],
    })

    await decidirSolicitacaoEncerramento({
      solicitacao_encerramento_id: ENC_ID,
      acao: 'aprovar',
      decidido_por_id: APROVADOR,
    })

    expect(updatesEncerramento[0].saldo_efetivamente_cancelado).toBeCloseTo(188.64, 2)
  })

  it('pedido cancelado: erro acionável mandando rejeitar', async () => {
    montarClient({ statusPedido: 'cancelado' })

    await expect(decidirSolicitacaoEncerramento({
      solicitacao_encerramento_id: ENC_ID,
      acao: 'aprovar',
      decidido_por_id: APROVADOR,
    })).rejects.toThrow(/Rejeite esta solicitação/)

    expect(encerrarSolicitacaoMock).not.toHaveBeenCalled()
  })

  it('pedido deletado: não reconcilia nem encerra', async () => {
    montarClient({ statusPedido: 'encerrado', deletado: true })

    await expect(decidirSolicitacaoEncerramento({
      solicitacao_encerramento_id: ENC_ID,
      acao: 'aprovar',
      decidido_por_id: APROVADOR,
    })).rejects.toThrow(/deletado/)

    expect(encerrarSolicitacaoMock).not.toHaveBeenCalled()
  })
})
