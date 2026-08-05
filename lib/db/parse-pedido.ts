/**
 * Extração (pura) dos dados do fornecedor a partir do texto da página 1 do
 * PDF do pedido de compra.
 *
 * Separado da rota pra ser testável sem PDF nem autenticação: a leitura do
 * arquivo é I/O, mas reconhecer o layout é regra de negócio — e era ela que
 * decidia, silenciosamente, se a tela conseguia ou não preencher os campos.
 */

export interface DadosPedidoExtraidos {
  numero_pedido: string
  razao_social: string
  cnpj: string
  telefone: string
  contato: string
}

/** Quantos campos-chave foram reconhecidos. 0 = layout não reconhecido. */
export function camposReconhecidos(d: DadosPedidoExtraidos): number {
  return [d.numero_pedido, d.razao_social, d.cnpj].filter(Boolean).length
}

/** True se o PDF não tem camada de texto útil (digitalizado / só imagem). */
export function pdfSemTexto(texto: string): boolean {
  return texto.trim().length < 20
}

export function extrairDadosPedido(texto: string): DadosPedidoExtraidos {
  const text = texto ?? ''

  // "Pedido 867 Data do pedido ..." — \b evita match em "Pedido de Compra"
  const numero_pedido = text.match(/\bPedido\s+(\d+)\s+Data/i)?.[1] ?? ''

  // Isola o bloco "Dados do fornecedor" pra não capturar campos da seção
  // WAVE (que tem CNPJ e Telefone próprios logo acima).
  const fornBlock =
    text.match(/Dados do fornecedor([\s\S]*?)(?:Informa[cç][oõ]es para entrega|Insumo\s)/i)?.[1] ??
    text

  // Razão social — remove prefixo numérico do ERP, ex.: "27 - " ou "418 - "
  const razao_social =
    fornBlock.match(/Raz[aã]o social\s+(?:\d+\s*[-–]\s*)?(.+)/i)?.[1]?.trim() ?? ''

  // Para antes de " IE" (ex.: "07.207.491/0004-38 IE 067134106")
  const cnpj = fornBlock.match(/CNPJ\/CPF\s+([\d.\/\-]+)/i)?.[1]?.trim() ?? ''

  // Formato variável: "(85) 3022-2447" ou "(85)2822255"
  const telefone =
    fornBlock.match(/Telefone\s+([\d()\s\-\.]+?)(?:\s{2,}|Fax|\n)/i)?.[1]?.trim() ?? ''

  // Nos modelos analisados o campo costuma vir vazio — nesse caso a regex
  // capturaria o rótulo seguinte, então descartamos.
  const vendedorRaw =
    fornBlock.match(/Vendedor\s+(.*?)(?:\s+E-mail|\s+Representante|\n)/i)?.[1]?.trim() ?? ''
  const contato = vendedorRaw.toLowerCase().startsWith('e-mail') ? '' : vendedorRaw

  return { numero_pedido, razao_social, cnpj, telefone, contato }
}
