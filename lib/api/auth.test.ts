import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Testes dos guards de autorização das rotas de API.
 *
 * Mocka as dependências de infraestrutura (Supabase server client e
 * resolução de permissões) pra exercitar só a lógica de decisão:
 *   - 401 quando não autenticado
 *   - 403 quando autenticado sem a permissão
 *   - null (autorizado) com a permissão ou como admin
 *   - requireAlgumaPermissao autoriza com QUALQUER uma das permissões
 */

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPermissoesEfetivas: vi.fn(),
  perfilSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: mocks.perfilSingle }),
      }),
    }),
  }),
}))

vi.mock('@/lib/db/permissoes', () => ({
  getPermissoesEfetivas: mocks.getPermissoesEfetivas,
}))

import {
  assertPermissao,
  requirePermissao,
  requireAlgumaPermissao,
  requireAdmin,
} from './auth'

const USER = { id: 'user-1', email: 'user@test.com' }

function logado() {
  mocks.getUser.mockResolvedValue({ data: { user: USER } })
}
function deslogado() {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
}
function comPermissoes(permissoes: Array<{ modulo: string; acao: string }>, fonte = 'template') {
  mocks.getPermissoesEfetivas.mockResolvedValue({ permissoes, fonte })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('assertPermissao', () => {
  it('retorna 401 quando não autenticado', async () => {
    deslogado()
    const r = await assertPermissao('contratos', 'criar')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(401)
  })

  it('retorna 403 quando autenticado sem a permissão', async () => {
    logado()
    comPermissoes([{ modulo: 'contratos', acao: 'visualizar' }])
    const r = await assertPermissao('contratos', 'criar')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('autoriza quando tem exatamente a permissão', async () => {
    logado()
    comPermissoes([{ modulo: 'contratos', acao: 'criar' }])
    const r = await assertPermissao('contratos', 'criar')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.isAdmin).toBe(false)
  })

  it('admin bypassa qualquer permissão', async () => {
    logado()
    comPermissoes([], 'admin')
    const r = await assertPermissao('qualquer', 'coisa')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.isAdmin).toBe(true)
  })
})

describe('requirePermissao (guard de rota)', () => {
  it('null (autorizado) com a permissão', async () => {
    logado()
    comPermissoes([{ modulo: 'medicoes', acao: 'editar' }])
    expect(await requirePermissao('medicoes', 'editar')).toBeNull()
  })

  it('NextResponse 403 sem a permissão', async () => {
    logado()
    comPermissoes([])
    const res = await requirePermissao('medicoes', 'editar')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    const body = await res!.json()
    expect(body.error).toContain('medicoes')
  })

  it('NextResponse 401 sem sessão', async () => {
    deslogado()
    const res = await requirePermissao('medicoes', 'editar')
    expect(res!.status).toBe(401)
  })
})

describe('requireAlgumaPermissao (OU lógico)', () => {
  it('autoriza com a primeira permissão', async () => {
    logado()
    comPermissoes([{ modulo: 'medicoes', acao: 'editar' }])
    const res = await requireAlgumaPermissao(['medicoes', 'editar'], ['aprovacoes', 'aprovar'])
    expect(res).toBeNull()
  })

  it('autoriza com a segunda permissão apenas', async () => {
    logado()
    comPermissoes([{ modulo: 'aprovacoes', acao: 'aprovar' }])
    const res = await requireAlgumaPermissao(['medicoes', 'editar'], ['aprovacoes', 'aprovar'])
    expect(res).toBeNull()
  })

  it('403 sem nenhuma das permissões', async () => {
    logado()
    comPermissoes([{ modulo: 'dashboard', acao: 'visualizar' }])
    const res = await requireAlgumaPermissao(['medicoes', 'editar'], ['aprovacoes', 'aprovar'])
    expect(res!.status).toBe(403)
  })
})

describe('requireAdmin', () => {
  it('null (autorizado) para perfil admin', async () => {
    logado()
    mocks.perfilSingle.mockResolvedValue({ data: { perfil: 'admin' } })
    expect(await requireAdmin()).toBeNull()
  })

  it('403 para perfil não-admin', async () => {
    logado()
    mocks.perfilSingle.mockResolvedValue({ data: { perfil: 'engenheiro_fip' } })
    const res = await requireAdmin()
    expect(res!.status).toBe(403)
  })

  it('403 sem sessão', async () => {
    deslogado()
    const res = await requireAdmin()
    expect(res!.status).toBe(403)
  })
})
