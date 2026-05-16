import { describe, it, expect } from 'vitest'
import {
  statusInicialNf,
  podeTransicionar,
  nfReservaSaldo,
} from './nf-workflow'

describe('statusInicialNf', () => {
  it('lançador SEM permissão de aprovar → aguardando_aprovacao', () => {
    expect(statusInicialNf(false)).toBe('aguardando_aprovacao')
  })
  it('lançador COM permissão de aprovar → aprovada (auto-aprovação)', () => {
    expect(statusInicialNf(true)).toBe('aprovada')
  })
})

describe('podeTransicionar', () => {
  it('aguardando_aprovacao → aprovada é válido', () => {
    expect(podeTransicionar('aguardando_aprovacao', 'aprovada')).toBe(true)
  })
  it('aguardando_aprovacao → em_correcao é válido', () => {
    expect(podeTransicionar('aguardando_aprovacao', 'em_correcao')).toBe(true)
  })
  it('em_correcao → aguardando_aprovacao é válido (reenvio)', () => {
    expect(podeTransicionar('em_correcao', 'aguardando_aprovacao')).toBe(true)
  })
  it('aprovada → em_correcao é inválido', () => {
    expect(podeTransicionar('aprovada', 'em_correcao')).toBe(false)
  })
  it('cancelada não transiciona pra lugar nenhum', () => {
    expect(podeTransicionar('cancelada', 'aprovada')).toBe(false)
  })
})

describe('nfReservaSaldo', () => {
  it('aguardando_aprovacao reserva saldo', () => {
    expect(nfReservaSaldo('aguardando_aprovacao')).toBe(true)
  })
  it('em_correcao reserva saldo', () => {
    expect(nfReservaSaldo('em_correcao')).toBe(true)
  })
  it('aprovada reserva saldo', () => {
    expect(nfReservaSaldo('aprovada')).toBe(true)
  })
  it('cancelada NÃO reserva saldo', () => {
    expect(nfReservaSaldo('cancelada')).toBe(false)
  })
  it('rejeitada legada NÃO reserva saldo', () => {
    expect(nfReservaSaldo('rejeitada')).toBe(false)
  })
})
