// Nome curto dos itens irmãos na Visão Geral.
//
// O orçamento repete a descrição inteira em cada item — "TUBOS E CONEXÕES -
// AGUAS PLUVIAIS - PRUMADA", "... - SUBSOLO 1", "... - TERREO" — e a coluna
// truncava justamente a parte que diferencia um do outro (o pavimento). Tira
// o trecho comum a todos os irmãos, separado por " - ", e deixa o resto.
// O nome completo continua no tooltip.

const SEP = /\s+-\s+/

/** Segmentos " - " comuns ao início de TODOS os nomes (precisa de 2+). */
export function prefixoComum(nomes: string[]): string[] {
  if (nomes.length < 2) return []
  const partes = nomes.map(n => String(n ?? '').trim().split(SEP))
  const comum: string[] = []
  for (let i = 0; ; i++) {
    const seg = partes[0][i]
    if (seg === undefined) break
    // Sobra pelo menos um segmento em cada nome: nunca zera um nome.
    if (!partes.every(p => p.length > i + 1 && p[i].toUpperCase() === seg.toUpperCase())) break
    comum.push(seg)
  }
  return comum
}

/** Nome sem os `n` primeiros segmentos " - ". */
export function semPrefixo(nome: string, n: number): string {
  if (n <= 0) return nome
  const partes = String(nome ?? '').trim().split(SEP)
  return partes.length > n ? partes.slice(n).join(' - ') : nome
}

/** id → nome curto, só para quem tem prefixo comum com os irmãos. */
export function nomesCurtos(irmaos: Array<{ id: string; nome: string }>): Map<string, string> {
  const out = new Map<string, string>()
  const n = prefixoComum(irmaos.map(i => i.nome)).length
  if (n === 0) return out
  for (const i of irmaos) out.set(i.id, semPrefixo(i.nome, n))
  return out
}
