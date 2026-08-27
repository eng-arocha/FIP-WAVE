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
            recebe a diferença sem contrapartida.
          </p>
          <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--text-2)' }}>
            Por isso o retrato do ERP virou <strong>parte do cálculo</strong>, não conferência
            opcional: o boletim limita o desconto de cada macro grupo ao que existe lançado lá, e o{' '}
            <code>% a lançar</code> cai junto. Sem retrato importado a medição não aprova.
          </p>
          <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--text-2)' }}>
            O corte é automático e seguro — nunca se lança percentual acima do físico. Mas ele{' '}
            <strong>não volta sozinho no mês seguinte</strong>: o desconto de cada medição é o
            material daquela medição. Lançar a nota no ERP <strong>antes</strong> de aprovar é o que
            garante o percentual cheio.
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

            <Passo n={4} titulo="Leia as faixas de cima" icone={<Search className="w-4 h-4" />}>
              São duas perguntas, e cada uma pede uma ação diferente:
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                <li>
                  <span style={{ color: '#EF4444' }}>Vermelha</span> —{' '}
                  <strong>notas nossas que não estão no Informakon</strong>, com pedido, número e
                  valor (<code>FIP-1085 · NF 546</code>). Resolve-se lançando lá.
                </li>
                <li>
                  <span style={{ color: '#F59E0B' }}>Âmbar</span> —{' '}
                  <strong>notas que estão no Informakon e não existem no site</strong>. Resolve-se
                  cadastrando o pedido aqui, ou confirmando que a nota é de outra obra.
                </li>
              </ul>
              <span className="block mt-1" style={{ color: 'var(--text-3)' }}>
                A tabela por macro item, abaixo, é detalhe — ver o porquê no fim desta página.
              </span>
            </Passo>

            <Passo n={5} titulo="Lance no ERP o que a faixa vermelha apontar">
              É o único passo que muda o resultado. Cada nota lançada vira lastro e o{' '}
              <code>% a lançar</code> daquele macro grupo sobe até o físico.
            </Passo>

            <Passo n={6} titulo="Confira as duas colunas em R$ e aprove">
              <code>Valor medido</code> e <code>Desconto fat-direto</code>, com a soma no rodapé.
              Se as duas fecham com o que você espera, aprove — o corte pelo lastro já está
              aplicado na tabela.
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
              É o caminho certo — o dinheiro é legítimo, só falta o registro. Lance as notas da
              lista no Informakon, volte, clique em <strong>Atualizar retrato</strong> e cole de
              novo. A faixa fica verde.
            </p>
            <p className="text-[13px] mt-1.5 font-medium" style={{ color: 'var(--text-1)' }}>
              O <code>% a lançar</code> sobe sozinho até o físico. Digite-o como está na tabela.
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
              Não há botão a apertar: o boletim <strong>já cortou</strong>. O desconto do macro
              grupo foi limitado ao <code>Vlr. a Desc</code> do ERP, começando pelo item de maior
              desconto e escorrendo para o próximo, sem nunca comer a mão de obra.
            </p>
            <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-2)' }}>
              Você não paga o que o ERP não vai descontar. Mas o percentual sai{' '}
              <strong>abaixo do físico</strong> nesta medição, e não é devolvido depois — por isso
              o passo 5 vem antes de aprovar.
            </p>
          </div>
        </div>

        {/* Próxima medição */}
        <div className="rounded-lg p-4" style={CARD}>
          <h2 className="text-sm font-bold mb-1.5" style={{ color: 'var(--text-1)' }}>
            E na medição seguinte?
          </h2>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            <strong>Cada medição começa limpa.</strong> O desconto de um item é sempre o material
            medido <em>naquela</em> medição, e o teto é o retrato do dia. Não há régua acumulada,
            recuperação de meses anteriores nem transbordo entre itens — foi tudo removido, porque
            qualquer um dos três podia empurrar o percentual acima do físico.
          </p>
          <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--text-2)' }}>
            A consequência prática: <strong>o corte de uma medição não reaparece na seguinte</strong>.
            Se um macro grupo ficou sem lastro em março, o percentual de março saiu menor e assim
            fica. Em abril o cálculo olha só o material de abril. Lançar a nota antes de aprovar é o
            que evita isso.
          </p>
          <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--text-2)' }}>
            O retrato também não se propaga: cada medição pede o do dia, porque o de um mês atrás
            não diz nada sobre o que está lançado hoje.
          </p>
        </div>

        {/* Onde fica cada coisa */}
        <div className="rounded-lg p-4" style={CARD}>
          <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--text-1)' }}>
            Onde fica cada coisa na tela
          </h2>
          <ul className="text-[13px] space-y-1.5 list-disc pl-5" style={{ color: 'var(--text-2)' }}>
            <li>
              <strong>Painel de conferência</strong> — no boletim, acima da tabela. O veredito
              nota a nota nas faixas de cima, e a tabela por macro item embaixo, que mostra o
              lastro do ERP contra o desconto pedido.
            </li>
            <li>
              <strong>Qual nota falta</strong> — clique no valor em{' '}
              <em>&quot;Boletim manda descontar&quot;</em> para abrir as notas daquele macro item,
              já classificadas: não está no ERP, lançada e a descontar, ou já descontada.
            </li>
            <li>
              <strong>Coluna <code>% a lançar</code></strong> — na linha cortada pelo lastro o
              percentual sai abaixo do <code>% Serv. Med.</code>, e o tooltip diz quanto foi
              cortado e por quê.
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
            E se o Informakon tiver nota que o site não tem?
          </p>
          <p className="text-[13px] leading-relaxed mt-0.5" style={{ color: 'var(--text-2)' }}>
            <strong>Esse é o erro mais caro dos dois</strong>, e por um motivo desagradável: nenhum
            outro número do boletim o denuncia. Se o pedido de fat-direto não foi cadastrado aqui,
            <code> NF Terceiro</code> fica baixo, <code>NF Desc.</code> fica baixo, e todas as contas
            fecham entre si — só que todas para menos. O boletim manda descontar menos do que deveria
            e a Wave recebe material sem abatimento.
          </p>
          <p className="text-[13px] leading-relaxed mt-1" style={{ color: 'var(--text-2)' }}>
            O outro erro, o de nota não lançada no ERP, pelo menos grita. Este só aparece porque o
            retrato traz o número da nota. Por isso a faixa âmbar não some sozinha: confira uma a
            uma e ou cadastre o pedido, ou confirme que a nota é de outra obra.
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
