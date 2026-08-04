import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regra de autorização de "solicitar encerramento de saldo".
 *
 * Antes, a rota exigia `contratos:editar` e o Engenheiro FIP levava
 * "Sem permissão para editar em contratos" — mas solicitar não é editar:
 * ele só abre o pedido, e o admin é quem autoriza (rota PATCH, restrita a
 * `medicoes:aprovar`). A regra correta é a mesma da visibilidade do contrato:
 * admin, ou usuário com vínculo em usuarios_contratos.
 */

const fromMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))

const { usuarioPodeAtuarNoContrato } = await import('./usuarios-contrato')

const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CONTRATO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function montarClient(opts: { perfil?: string | null; temVinculo: boolean }) {
  fromMock.mockImplementation((tabela: string) => {
    if (tabela === 'perfis') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.perfil === undefined ? null : { perfil: opts.perfil },
              error: null,
            }),
          }),
        }),
      }
    }
    if (tabela === 'usuarios_contratos') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.temVinculo ? { contrato_id: CONTRATO } : null,
                error: null,
              }),
            }),
          }),
        }),
      }
    }
    throw new Error(`tabela inesperada: ${tabela}`)
  })
}

// Corpo em bloco de propósito: `() => fromMock.mockReset()` devolveria o
// próprio mock, e o Vitest trata retorno de função no beforeEach como
// teardown — chamaria fromMock() sem argumentos depois de cada teste.
beforeEach(() => { fromMock.mockReset() })

describe('usuarioPodeAtuarNoContrato', () => {
  it('admin pode, mesmo sem vínculo explícito', async () => {
    montarClient({ perfil: 'admin', temVinculo: false })
    expect(await usuarioPodeAtuarNoContrato(USER, CONTRATO)).toBe(true)
  })

  it('engenheiro FIP vinculado pode — não depende de contratos:editar', async () => {
    montarClient({ perfil: 'engenheiro_fip', temVinculo: true })
    expect(await usuarioPodeAtuarNoContrato(USER, CONTRATO)).toBe(true)
  })

  it('visualizador vinculado pode solicitar (quem decide é o aprovador)', async () => {
    montarClient({ perfil: 'visualizador', temVinculo: true })
    expect(await usuarioPodeAtuarNoContrato(USER, CONTRATO)).toBe(true)
  })

  it('usuário sem vínculo com o contrato não pode', async () => {
    montarClient({ perfil: 'engenheiro_fip', temVinculo: false })
    expect(await usuarioPodeAtuarNoContrato(USER, CONTRATO)).toBe(false)
  })

  it('perfil inexistente e sem vínculo não pode', async () => {
    montarClient({ perfil: undefined, temVinculo: false })
    expect(await usuarioPodeAtuarNoContrato(USER, CONTRATO)).toBe(false)
  })
})
