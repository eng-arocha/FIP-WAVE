import { describe, it, expect } from 'vitest'
import {
  extrairDadosPedido, camposReconhecidos, pdfSemTexto,
} from './parse-pedido'

/**
 * Texto como o pdf-parse devolve a página 1 de um pedido de compra do ERP:
 * rótulo e valor na mesma linha, seção da WAVE antes da do fornecedor.
 */
const TEXTO_PEDIDO = [
  'Pedido de Compra',
  'Pedido 867 Data do pedido 15/04/2026',
  'WAVE ENGENHARIA',
  'CNPJ/CPF 11.111.111/0001-11',
  'Telefone (11) 4000-0000',
  'Dados do fornecedor',
  'Razão social 418 - CACTUS COMERCIO E SERVICO DE MATERIAL ELETRICO LTDA',
  'CNPJ/CPF 01.650.186/0001-97 IE 067134106',
  'Telefone (85) 3022-2447  Fax',
  'Vendedor E-mail vendas@cactus.com.br',
  'Informações para entrega',
  'Insumo 1 CABO 10MM',
].join('\n')

describe('extrairDadosPedido', () => {
  it('extrai os campos do bloco do fornecedor', () => {
    const d = extrairDadosPedido(TEXTO_PEDIDO)
    expect(d.numero_pedido).toBe('867')
    expect(d.razao_social).toBe('CACTUS COMERCIO E SERVICO DE MATERIAL ELETRICO LTDA')
    expect(d.cnpj).toBe('01.650.186/0001-97')
    expect(d.telefone).toBe('(85) 3022-2447')
  })

  it('não pega o CNPJ nem o telefone da seção da WAVE', () => {
    const d = extrairDadosPedido(TEXTO_PEDIDO)
    expect(d.cnpj).not.toBe('11.111.111/0001-11')
    expect(d.telefone).not.toContain('4000')
  })

  it('descarta "Vendedor" vazio em vez de capturar o rótulo seguinte', () => {
    expect(extrairDadosPedido(TEXTO_PEDIDO).contato).toBe('')
  })

  it('captura o vendedor quando preenchido', () => {
    const texto = TEXTO_PEDIDO.replace(
      'Vendedor E-mail vendas@cactus.com.br',
      'Vendedor Maria Souza E-mail vendas@cactus.com.br',
    )
    expect(extrairDadosPedido(texto).contato).toBe('Maria Souza')
  })

  it('remove o prefixo numérico do ERP da razão social', () => {
    const texto = TEXTO_PEDIDO.replace('418 - CACTUS', '27 - CACTUS')
    expect(extrairDadosPedido(texto).razao_social).toMatch(/^CACTUS/)
  })

  it('"Pedido de Compra" sozinho não vira número de pedido', () => {
    expect(extrairDadosPedido('Pedido de Compra\nnada mais').numero_pedido).toBe('')
  })
})

describe('classificação da falha de leitura', () => {
  it('layout desconhecido: tem texto, mas nenhum campo reconhecido', () => {
    const texto = 'Contrato de prestação de serviços entre as partes signatárias abaixo.'
    expect(pdfSemTexto(texto)).toBe(false)
    expect(camposReconhecidos(extrairDadosPedido(texto))).toBe(0)
  })

  it('PDF digitalizado: praticamente sem texto', () => {
    expect(pdfSemTexto('   \n  ')).toBe(true)
    expect(pdfSemTexto('')).toBe(true)
  })

  it('pedido válido reconhece os três campos-chave', () => {
    expect(camposReconhecidos(extrairDadosPedido(TEXTO_PEDIDO))).toBe(3)
  })

  it('reconhecer só o número do pedido já basta pra não recusar', () => {
    const d = extrairDadosPedido('Pedido 912 Data do pedido 01/01/2026')
    expect(camposReconhecidos(d)).toBe(1)
  })
})
