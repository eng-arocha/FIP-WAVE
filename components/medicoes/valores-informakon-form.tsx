'use client'

import { useEffect, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  CAMPOS_VALORES, divergenciasComSite, validarValoresInformakon,
  type ValoresInformakon,
} from '@/lib/informakon/valores-financeiros'

/**
 * O que vai no body de POST .../aprovar como `valores_informakon`.
 * `null` enquanto o formulário não estiver consistente — o botão de aprovar
 * fica desabilitado.
 */
export interface PayloadValoresInformakon {
  contratual: number
  material: number
  retencao: number
  descontos_diversos: number
  liquido: number
  origem: 'importado' | 'digitado'
  justificativa?: string
}

type Campo = keyof ValoresInformakon

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1.834.551,81" ou "1834551.81" → número. Vazio ou lixo → NaN. */
function parseValor(txt: string): number {
  const t = txt.trim().replace(/^R\$\s*/, '')
  if (!t) return NaN
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN
}

/**
 * Bloco "Valores Financeiros do Informakon" da aprovação (spec 2026-10-28).
 * Pré-preenche pelo relatório importado quando ele já tem a medição; senão o
 * aprovador digita o que está na tela do Informakon. Mostra o número do site
 * ao lado e exige justificativa quando a diferença passa de R$ 1,00.
 */
export function ValoresInformakonForm({
  contratoId,
  medicaoId,
  onChange,
}: {
  contratoId: string
  medicaoId: string
  onChange: (payload: PayloadValoresInformakon | null) => void
}) {
  const [carregando, setCarregando] = useState(true)
  const [site, setSite] = useState<ValoresInformakon | null>(null)
  const [importado, setImportado] = useState<ValoresInformakon | null>(null)
  const [referencia, setReferencia] = useState<string | null>(null)
  const [textos, setTextos] = useState<Record<Campo, string>>({
    contratual: '', material: '', retencao: '', descontosDiversos: '', liquido: '',
  })
  const [justificativa, setJustificativa] = useState('')

  useEffect(() => {
    let vivo = true
    fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/valores-informakon`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!vivo || !d) return
        setSite(d.site ?? null)
        setReferencia(d.referencia ?? null)
        if (d.importado) {
          setImportado(d.importado)
          const t = {} as Record<Campo, string>
          for (const { campo } of CAMPOS_VALORES) t[campo] = fmt(Number(d.importado[campo]) || 0)
          setTextos(t)
        }
      })
      .catch(() => null)
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [contratoId, medicaoId])

  const valores: ValoresInformakon = useMemo(() => ({
    contratual: parseValor(textos.contratual),
    material: parseValor(textos.material),
    retencao: parseValor(textos.retencao),
    descontosDiversos: parseValor(textos.descontosDiversos),
    liquido: parseValor(textos.liquido),
  }), [textos])

  const preenchido = CAMPOS_VALORES.every(({ campo }) => Number.isFinite(valores[campo]))
  const erro = preenchido ? validarValoresInformakon(valores) : null
  const divergencias = preenchido && !erro && site ? divergenciasComSite(valores, site) : []
  const precisaJustificar = divergencias.length > 0
  const justificativaOk = !precisaJustificar || justificativa.trim().length >= 10
  const origem: 'importado' | 'digitado' = importado
    && CAMPOS_VALORES.every(({ campo }) => Math.abs(valores[campo] - importado[campo]) < 0.005)
    ? 'importado'
    : 'digitado'

  const valido = preenchido && !erro && justificativaOk
  useEffect(() => {
    onChange(valido
      ? {
          contratual: valores.contratual,
          material: valores.material,
          retencao: valores.retencao,
          descontos_diversos: valores.descontosDiversos,
          liquido: valores.liquido,
          origem,
          justificativa: precisaJustificar ? justificativa.trim() : undefined,
        }
      : null)
    // onChange do pai costuma ser um setState — estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valido, valores, origem, justificativa, precisaJustificar])

  const divPorCampo = new Map(divergencias.map(d => [d.campo, d]))

  return (
    <div className="space-y-2">
      <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">
        Valores Financeiros do Informakon
      </Label>
      <p className="text-[11px] text-[var(--text-3)]">
        {carregando
          ? 'Carregando…'
          : importado
            ? `Pré-preenchido pelo relatório importado${referencia ? ` (${referencia})` : ''}. Confira com a tela do Informakon.`
            : 'Digite os números da tela "Valores Financeiros" da medição no Informakon.'}
        {' '}O líquido é o valor do pedido da NF Wave.
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[var(--text-3)]">
            <th className="text-left font-medium py-1">Campo</th>
            <th className="text-right font-medium py-1">Informakon</th>
            <th className="text-right font-medium py-1 pl-2">Site</th>
          </tr>
        </thead>
        <tbody>
          {CAMPOS_VALORES.map(({ campo, rotulo }) => {
            const d = divPorCampo.get(campo)
            return (
              <tr key={campo}>
                <td className="py-1 pr-2 text-[var(--text-2)]">{rotulo}</td>
                <td className="py-1">
                  <input
                    inputMode="decimal"
                    aria-label={rotulo}
                    value={textos[campo]}
                    onChange={e => setTextos(t => ({ ...t, [campo]: e.target.value }))}
                    className={`w-full text-right tabular-nums rounded px-2 py-1 bg-[var(--surface-1)] border ${
                      d ? 'border-amber-500/60' : 'border-[var(--border)]'
                    } text-[var(--text-1)]`}
                    placeholder="0,00"
                  />
                </td>
                <td className={`py-1 pl-2 text-right tabular-nums ${d ? 'text-amber-400' : 'text-[var(--text-3)]'}`}>
                  {site ? fmt(site[campo]) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {erro && (
        <div className="p-2 rounded border border-red-800/50 bg-red-900/20 text-xs text-red-400">{erro}</div>
      )}
      {precisaJustificar && (
        <div className="space-y-1.5">
          <div className="p-2 rounded border border-amber-800/50 bg-amber-900/20 text-xs text-amber-400">
            Diferença acima de R$ 1,00 em: {divergencias.map(d => `${d.rotulo} (${d.diferenca > 0 ? '+' : ''}${fmt(d.diferenca)})`).join('; ')}.
            Vale o Informakon — explique a diferença.
          </div>
          <Textarea
            placeholder="Justificativa (mín. 10 caracteres)"
            value={justificativa}
            onChange={e => setJustificativa(e.target.value)}
            className="bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] text-xs"
          />
        </div>
      )}
    </div>
  )
}
