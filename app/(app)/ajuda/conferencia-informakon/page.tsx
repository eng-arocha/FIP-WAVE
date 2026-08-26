import { Topbar } from '@/components/layout/topbar'
import Link from 'next/link'
import {
  ArrowLeft, ClipboardPaste, Search, ShieldCheck, CheckCircle2, AlertTriangle, Printer,
} from 'lucide-react'

export const dynamic = 'force-static'

/**
 * Passo a passo da conferência contra o Informakon.
 *
 * Página única e estável: o procedimento é o mesmo em toda medição, então não
 * depende de contrato, medição nem período. É linkada do boletim de qualquer
 * medição — quem está fechando abre daqui e segue.
 *
 * O conteúdo é o procedimento, não a teoria. A explicação das colunas
 * continua no botão "Critério", dentro do boletim.
 */

const CARD: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
}

function Passo({
  n, titulo, children, icone,
}: {
  n: number
  titulo: string
  children: React.ReactNode
  icone?: React.ReactNode
}) {
  return (
    <li className="flex gap-3">
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: 'rgba(59,130,246,0.12)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.35)' }}
        aria-hidden
      >
        {n}
      </div>
      <div className="min-w-0 pb-1">
        <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-1)' }}>
          {icone}{titulo}
        </p>
        <div className="text-[13px] leading-relaxed mt-0.5" style={{ color: 'var(--text-2)' }}>
          {children}
        </div>
      </div>
    </li>
  )
}

export default function ConferenciaInformakonPage() {
  return (
    <div>
      <Topbar
        title="Conferir a medição contra o Informakon"
        subtitle="Mesmo procedimento em toda medição"
      />

      <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
        <div className="flex gap-2 flex-wrap print:hidden">
          <Link href="/dashboard">
            <button
              className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </button>
          </Link>
        </div>

        {/* Por que isto existe */}
        <div className="rounded-lg p-4" style={CARD}>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            O Informakon <strong>só desconta nota que já está lançada lá</strong>. Se o boletim manda
            descontar mais do que existe, o ERP libera o valor cheio e desconta só o que tem — a Wave
            recebe a diferença sem contrapartida. E não se corrige sozinho depois: na aprovação o
            boletim grava aquela nota como <em>abatida</em>, e ela sai da fila para sempre.
          </p>
          <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--text-2)' }}>
            Este procedimento existe para descobrir isso <strong>antes</strong> de digitar o percentual.
          </p>
        </div>

        {/* Passo a passo */}
        <div className="rounded-lg p-4" style={CARD}>
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-1)' }}>
            O passo a passo
          </h2>
          <ol className="space-y-3">
            <Passo n={1} titulo="Feche a medição como sempre">
              Nada muda no lançamento das quantidades.
            </Passo>

            <Passo n={2} titulo="Abra o Boletim Informakon da medição">
              O painel de conferência fica logo acima da tabela de itens.
            </Passo>

            <Passo n={3} titulo="Atualizar retrato" icone={<ClipboardPaste className="w-4 h-4" />}>
              No Informakon, selecione a grade de faturamento direto <strong>inteira</strong> e copie —
              com as colunas <code>Documento</code>, <code>Especificação</code>,{' '}
              <code>Vlr. a Desc</code> e <code>Vlr.Desc</code>. Cole no campo e salve.
              <span className="block mt-1" style={{ color: 'var(--text-3)' }}>
                Não some nada por grupo: o site soma. E é o número da nota que faz a conferência
                virar certeza em vez de estimativa. Cabeçalho e linha de totais podem vir junto.
              </span>
            </Passo>

            <Passo n={4} titulo="Leia só a faixa de cima" icone={<Search className="w-4 h-4" />}>
              Ela responde a única pergunta com ação possível:{' '}
              <strong>quais notas nossas não estão no Informakon</strong>, com número e valor.
              <span className="block mt-1" style={{ color: 'var(--text-3)' }}>
                A tabela por macro item, abaixo, é detalhe — ver o porquê no fim desta página.
              </span>
            </Passo>

            <Passo n={5} titulo="Decida: lançar ou adotar">
              As duas saídas estão no quadro seguinte. Qualquer uma resolve.
            </Passo>

            <Passo n={6} titulo="Aprove a medição">
              Só depois que a faixa de cima estiver verde, ou que o retrato tiver sido adotado.
            </Passo>
          </ol>
        </div>

        {/* A bifurcação */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div
            className="rounded-lg p-4"
            style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.35)' }}
          >
            <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#10B981' }}>
              <CheckCircle2 className="w-4 h-4" /> Consegue lançar as notas
            </p>
            <p className="text-[13px] leading-relaxed mt-1.5" style={{ color: 'var(--text-2)' }}>
              É o melhor caminho — o dinheiro é legítimo, só falta o registro. Lance as notas da lista
              no Informakon, volte, clique em <strong>Atualizar retrato</strong> e cole de novo.
              A faixa fica verde.
            </p>
            <p className="text-[13px] mt-1.5 font-medium" style={{ color: 'var(--text-1)' }}>
              Lance o <code>% a lançar</code> cheio, como está na tabela.
            </p>
          </div>

          <div
            className="rounded-lg p-4"
            style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.35)' }}
          >
            <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#F59E0B' }}>
              <ShieldCheck className="w-4 h-4" /> Não dá tempo de lançar
            </p>
            <p className="text-[13px] leading-relaxed mt-1.5" style={{ color: 'var(--text-2)' }}>
              Clique em <strong>Adotar nesta medição</strong>. Deve aparecer a confirmação verde com o
              valor reclassificado; se aparecer vermelho, o texto diz o motivo.
            </p>
            <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-2)' }}>
              O <code>% a lançar</code> cai <strong>no valor exato</strong> do que o ERP não tem. Você
              não paga o que ele não vai descontar, e a nota continua na fila.
            </p>
          </div>
        </div>

        {/* Próxima medição */}
        <div className="rounded-lg p-4" style={CARD}>
          <h2 className="text-sm font-bold mb-1.5" style={{ color: 'var(--text-1)' }}>
            E na medição seguinte?
          </h2>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            <strong>Você não precisa lembrar de nada.</strong> Como a aprovação não gravou aquela nota
            como abatida, a régua acumulada a devolve sozinha em <code>NF Desc.</code> na medição
            seguinte. Se nesse meio-tempo ela foi lançada no ERP, desconta ali e o assunto encerra.
          </p>
          <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--text-2)' }}>
            Só uma ressalva: <strong>a adoção vale para aquela medição e só para ela</strong>. Não se
            propaga. Cada medição começa limpa e pede o retrato do dia — que é o certo, porque o
            retrato de um mês atrás não diz nada sobre o que está lançado hoje.
          </p>
        </div>

        {/* Onde fica cada coisa */}
        <div className="rounded-lg p-4" style={CARD}>
          <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--text-1)' }}>
            Onde fica cada coisa na tela
          </h2>
          <ul className="text-[13px] space-y-1.5 list-disc pl-5" style={{ color: 'var(--text-2)' }}>
            <li>
              <strong>Painel de conferência</strong> — no boletim, acima da tabela. Três faixas:
              o veredito nota a nota, o botão de adotar (ou a confirmação verde com{' '}
              <em>Desfazer</em>), e a tabela por macro item.
            </li>
            <li>
              <strong>Qual nota falta</strong> — clique no valor em{' '}
              <em>&quot;Boletim manda descontar&quot;</em> para abrir as notas daquele macro item,
              já classificadas: não está no ERP, lançada e a descontar, ou já descontada.
            </li>
            <li>
              <strong>Coluna <code>% a lançar</code></strong> — na linha afetada aparece{' '}
              <span style={{ color: '#EF4444' }}>⚠ R$ X sem lançar no ERP</span> embaixo do percentual.
              O tooltip diz de onde vem.
            </li>
            <li>
              <strong>CSV e &quot;copiar&quot;</strong> — coluna <em>Não lançada no ERP</em>.
            </li>
            <li>
              <strong>Botão &quot;Critério&quot;</strong> — a explicação das colunas e das fórmulas.
              Este passo a passo é o <em>o que fazer</em>; o Critério é o <em>por quê</em>.
            </li>
          </ul>
        </div>

        {/* Duas dúvidas que sempre voltam */}
        <div className="rounded-lg p-4" style={CARD}>
          <h2 className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-1)' }}>
            <AlertTriangle className="w-4 h-4" style={{ color: '#F59E0B' }} />
            Duas dúvidas que sempre voltam
          </h2>

          <p className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
            Por que a tabela por macro item nunca zera?
          </p>
          <p className="text-[13px] leading-relaxed mt-0.5" style={{ color: 'var(--text-2)' }}>
            Porque os dois lados classificam o mesmo material de formas diferentes. O Informakon
            amarra a nota ao <strong>item do pedido da FIP</strong> — a mesma nota aparece em vários
            macro itens lá, uma delas em sete. Nós rateamos pelos <strong>nossos detalhamentos</strong>.
            Creditar um grupo tira saldo de outro, e o total não anda. Por isso o veredito ficou na
            faixa de cima, que compara nota a nota e ignora macro item.
          </p>

          <p className="text-[13px] font-semibold mt-3" style={{ color: 'var(--text-1)' }}>
            Preciso corrigir lançamento errado no Informakon?
          </p>
          <p className="text-[13px] leading-relaxed mt-0.5" style={{ color: 'var(--text-2)' }}>
            Não — e nem seria possível. Nota lançada em outro macro item não é nota faltando: o site
            lê o saldo do ERP no endereçamento do boletim, então ela é contada onde você a pede.
            O que precisa de ação é só o que aparece na faixa de cima.
          </p>
        </div>

        <div className="print:hidden">
          <button
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          >
            <Printer className="w-3.5 h-3.5" /> Use Ctrl+P para imprimir
          </button>
        </div>
      </div>
    </div>
  )
}
