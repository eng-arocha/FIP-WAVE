'use client'
// Gera o rascunho do pedido de NF de material da FIP sem medição, com os itens
// marcados do relatório "Material medido sem NF". O valor de cada item é
// recalculado no servidor (rota material-sem-nf/pedido-fip).
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FilePlus2, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

export interface ItemPedidoFip {
  id: string
  codigo: string
  nome: string
  semNf: number
  fipEmAndamento: number
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function PedidoFipButton({ contratoId, itens }: { contratoId: string; itens: ItemPedidoFip[] }) {
  const router = useRouter()
  const livres = useMemo(() => itens.filter(i => !(i.fipEmAndamento > 0.5)), [itens])
  const [aberto, setAberto] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [criado, setCriado] = useState<{ id: string; numero: number | null; valor_total: number; alertas: string[] } | null>(null)

  const total = livres.filter(i => marcados.has(i.id)).reduce((s, i) => s + i.semNf, 0)
  const todos = livres.length > 0 && livres.every(i => marcados.has(i.id))

  function abrir() {
    setMarcados(new Set(livres.map(i => i.id)))
    setErro(null)
    setCriado(null)
    setAberto(true)
  }

  function alternar(id: string) {
    setMarcados(prev => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  async function criar() {
    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch(`/api/contratos/${contratoId}/material-sem-nf/pedido-fip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detalhamento_ids: Array.from(marcados) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(data?.error || `Falha ao criar o pedido (${res.status}).`)
        return
      }
      setCriado(data)
      router.refresh()
    } catch (e) {
      setErro(String((e as Error)?.message ?? e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        disabled={livres.length === 0}
        title={livres.length === 0 ? 'Todos os itens já têm pedido FIP em andamento' : undefined}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white bg-[#1E3A8A] hover:opacity-90 disabled:opacity-40"
      >
        <FilePlus2 className="w-3.5 h-3.5" /> Gerar pedido FIP
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pedido de NF de material da FIP</DialogTitle>
            <DialogDescription>
              Cria um RASCUNHO de pedido em nome da FIP, sem medição, pelo valor sem NF de cada item.
              Depois de aprovado, ele zera a FIP desses itens no boletim. Antes de gerar, confira se a
              NF que sobra no vizinho não é rateio errado do pedido.
            </DialogDescription>
          </DialogHeader>

          {criado ? (
            <div className="text-sm text-[var(--text-2)] flex flex-col gap-2">
              <p>
                Rascunho criado{criado.numero != null ? ` (FIP-${String(criado.numero).padStart(4, '0')})` : ''}:{' '}
                <b>R$ {fmt(criado.valor_total)}</b>. Abra o pedido, informe o Nº Pedido Interno FIP e envie
                para aprovação.
              </p>
              {criado.alertas.map(a => (
                <p key={a} className="text-xs text-[#B45309]">{a}</p>
              ))}
              <DialogFooter>
                <Link
                  href={`/contratos/${contratoId}/fat-direto/${criado.id}`}
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-white bg-[#1E3A8A]"
                >
                  Abrir o pedido
                </Link>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="max-h-[50vh] overflow-y-auto border border-[var(--border)] rounded-md">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-[var(--text-3)] sticky top-0 bg-[var(--surface-2)]">
                    <tr>
                      <th className="py-1.5 px-2 w-8">
                        <input
                          type="checkbox"
                          aria-label="Marcar todos"
                          checked={todos}
                          onChange={() => setMarcados(todos ? new Set() : new Set(livres.map(i => i.id)))}
                        />
                      </th>
                      <th className="text-left py-1.5 px-2">Item</th>
                      <th className="text-right py-1.5 px-2">Sem NF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map(i => {
                      const bloqueado = i.fipEmAndamento > 0.5
                      return (
                        <tr key={i.id} className="border-t border-[var(--border)]/40">
                          <td className="py-1 px-2 text-center">
                            <input
                              type="checkbox"
                              aria-label={`Incluir ${i.codigo}`}
                              disabled={bloqueado}
                              checked={!bloqueado && marcados.has(i.id)}
                              onChange={() => alternar(i.id)}
                            />
                          </td>
                          <td className="py-1 px-2">
                            <span className="font-mono text-[var(--text-3)] mr-1.5">{i.codigo}</span>
                            <span className="text-[var(--text-2)]">{i.nome}</span>
                            {bloqueado && (
                              <span className="ml-1.5 text-[10px] text-[#B45309]">
                                pedido FIP em andamento (R$ {fmt(i.fipEmAndamento)})
                              </span>
                            )}
                          </td>
                          <td className="py-1 px-2 text-right tabular-nums">{fmt(i.semNf)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {erro && <p className="text-xs text-red-500">{erro}</p>}
              <DialogFooter className="items-center gap-3">
                <span className="text-xs text-[var(--text-2)] tabular-nums">
                  {marcados.size} item(ns) · <b>R$ {fmt(total)}</b>
                </span>
                <button
                  onClick={criar}
                  disabled={enviando || marcados.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white bg-[#1E3A8A] disabled:opacity-40"
                >
                  {enviando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Criar rascunho
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
