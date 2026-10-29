import { describe, it, expect } from 'vitest'
import { nomesCurtos, prefixoComum } from './nome-curto'

describe('nome curto dos irmãos', () => {
  it('tira o trecho comum e deixa o pavimento (8.1)', () => {
    const r = nomesCurtos([
      { id: 'a', nome: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - PRUMADAS' },
      { id: 'b', nome: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 1' },
      { id: 'c', nome: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - TERREO' },
    ])
    expect(r.get('a')).toBe('PRUMADAS')
    expect(r.get('b')).toBe('SUBSOLO 1')
    expect(r.get('c')).toBe('TERREO')
  })

  it('nunca deixa um nome vazio', () => {
    expect(prefixoComum(['A - B', 'A - B - C'])).toEqual(['A'])
  })

  it('sem trecho comum, ou item único, não mexe', () => {
    expect(nomesCurtos([{ id: 'a', nome: 'X - 1' }, { id: 'b', nome: 'Y - 2' }]).size).toBe(0)
    expect(nomesCurtos([{ id: 'a', nome: 'X - 1' }]).size).toBe(0)
  })

  it('ignora maiúsculas e espaços em volta do hífen', () => {
    const r = nomesCurtos([{ id: 'a', nome: 'Eletroduto -  Térreo' }, { id: 'b', nome: 'ELETRODUTO - 1º pav' }])
    expect(r.get('b')).toBe('1º pav')
  })
})
