import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Cancelamento de NF — o "excluir" do produto.
 *
 * Não apaga a linha: move pra 'cancelada', o estado terminal do workflow.
 * Como 'cancelada' não reserva saldo (`nfReservaSaldo`), o valor volta pro
 * saldo do pedido na hora, que é o efeito prático esperado — e o lançamento
 * financeiro continua auditável.
 */

const fromMock = vi.fn()
const auditMock = vi.fn(async (_evt: Record<string, any>) => {})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))
vi.mock('@/lib/api/audit', () => ({
  audit: (evt: Record<string, any>) => auditMock(evt),
}))
vi.mock('@/lib/db/fat-direto', () => ({
  validarNotaFiscal3Way: vi.fn(),
  NFMatchError: class extends Error {},
}))

const { cancelarNotaFiscal } = await import('./nf-workflow')
const { nfReservaSaldo } = await import('./nf-status')

const NF_ID = '44444444-4444-4444-4444-444444444444'
const ATOR = { actor_id: '55555555-5555-5555-5555-555555555555', actor_email: 'admin@fip.eng.br' }

function montarClient(opts: { status: string; encontrada?: boolean }) {
  const updates: any[] = []
  fromMock.mockImplementation((tabela: string) => {
    if (tabela !== 'notas_fiscais_fat_direto') throw new Error(`tabela inesperada: ${tabela}`)
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: opts.encontrada === false ? null : {
              id: NF_ID,
              solicitacao_id: 'ped-1',
              numero_nf: '46691',
              valor: 13610.4,
              status: opts.status,
            },
            error: opts.encontrada === false ? { message: 'not found' } : null,
          }),
        }),
      }),
      update: (payload: any) => {
        updates.push(payload)
        return { eq: async () => ({ error: null }) }
      },
    }
  })
  return { updates }
}

beforeEach(() => {
  fromMock.mockReset()
  auditMock.mockClear()
})

describe('cancelarNotaFiscal', () => {
  it('NF aguardando aprovação: cancela e devolve os dados do lançamento', async () => {
    const { updates } = montarClient({ status: 'aguardando_aprovacao' })

    const r = await cancelarNotaFiscal(NF_ID, 'lançada em duplicidade', ATOR)

    expect(updates[0].status).toBe('cancelada')
    expect(updates[0].motivo_rejeicao).toBe('lançada em duplicidade')
    expect(r).toMatchObject({ numero_nf: '46691', valor: 13610.4, solicitacao_id: 'ped-1' })
  })

  it('NF já aprovada também pode ser cancelada (aprovação por engano)', async () => {
    const { updates } = montarClient({ status: 'aprovada' })
    await cancelarNotaFiscal(NF_ID, 'aprovada por engano', ATOR)
    expect(updates[0].status).toBe('cancelada')
  })

  it('o status resultante libera o saldo do pedido', () => {
    // É daqui que vem a devolução do valor: cancelada não reserva saldo.
    expect(nfReservaSaldo('cancelada')).toBe(false)
    expect(nfReservaSaldo('aprovada')).toBe(true)
  })

  it('registra auditoria com o status anterior', async () => {
    montarClient({ status: 'em_correcao' })
    await cancelarNotaFiscal(NF_ID, 'arquivo errado', ATOR)

    expect(auditMock).toHaveBeenCalledOnce()
    const evt = auditMock.mock.calls[0][0]
    expect(evt.event).toBe('nf.cancelada')
    expect(evt.entity_id).toBe(NF_ID)
    expect(evt.metadata.status_anterior).toBe('em_correcao')
    expect(evt.metadata.motivo).toBe('arquivo errado')
  })

  it('recusa cancelar o que já está cancelado', async () => {
    montarClient({ status: 'cancelada' })
    await expect(cancelarNotaFiscal(NF_ID, 'de novo', ATOR))
      .rejects.toThrow(/já está cancelada/)
  })

  it('exige motivo', async () => {
    montarClient({ status: 'aprovada' })
    await expect(cancelarNotaFiscal(NF_ID, '   ', ATOR))
      .rejects.toThrow(/Motivo do cancelamento é obrigatório/)
  })

  it('NF inexistente', async () => {
    montarClient({ status: 'aprovada', encontrada: false })
    await expect(cancelarNotaFiscal(NF_ID, 'qualquer', ATOR))
      .rejects.toThrow(/NF não encontrada/)
  })
})
