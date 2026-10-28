# Dívidas registradas

Decisões adiadas, com o motivo e o momento certo de aplicar — pra ninguém
reabrir a discussão do zero.

## 2026-10-28 — MED-008: descontar R$ 31.916,58 da MSF/Cordeiro (1.3.1)

**O que é:** na MED-007 o Informakon lançou o 1.3.1 (Painel de Média Tensão)
a 100%, sem as notas da MSF/Cordeiro. A Wave recebeu R$ 31.916,58 de material
como serviço (NF Wave reemitida por R$ 479.560,54). O site foi alinhado ao
Informakon no manual-fix 097: o snapshot do 1.3.1 está em 100% lançado, então
a camada ① NÃO vai propor esse desconto sozinha.

**O que fazer na MED-008, quando as notas entrarem no Informakon:**
1. No Informakon, descontar as notas da MSF/Cordeiro no "Material Fornecido
   a Descontar" da medição, **sem lançar % no 1.3.1** (ele já está a 100%).
2. No site, antes de aprovar a MED-008, gravar o mesmo valor no ajuste da
   medição. Use o valor efetivamente descontado no Informakon, até
   R$ 31.916,58:
   ```sql
   update medicoes
      set ajuste_material_anterior = 31916.58,
          ajuste_material_anterior_motivo = 'Notas MSF/Cordeiro do 1.3.1 lançado a 100% na MED-007 sem nota (manual-fix 097)'
    where contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and numero = 8;
   ```
   O ajuste reduz a NF Wave e não mexe na retenção, como no Informakon: a
   nota descontada não altera o valor contratual lançado.
3. Conferir o líquido do site com "Valor Líquido da Medição" do Informakon
   antes de emitir o pedido Wave.

**Se as notas não vierem:** a Wave fica com os R$ 31.916,58. Cobrar da Wave
ou descontar no encerramento.

**Em aberto:** os R$ 501,41 a mais da NF 228 (FIP) e os R$ 33,70 de
"descontos diversos" ficaram só no total da MED-007, sem rateio por item.

**Regra para os próximos cortes (a decidir):** ou o Informakon segue o %
ajustado do site, ou o site passa a sugerir o % real e transforma o corte em
ajuste automático na medição em que a nota entrar.

## 2026-10-28 — Tarefas duplicadas no orçamento (ex.: três "1.6" no grupo 1)

**O que é:** seeds antigos (migrations 005/011/015) gravaram a mesma tarefa
mais de uma vez. No contrato WAVE-2025-001 o grupo 1 tem a tarefa 1.6 real
(com detalhamentos) e duas cópias vazias ("Tranformadores", com erro de
digitação), cada uma com cabeçalho de R$ 159.374,24. Varredura das tarefas
dos 18 grupos: o 1.6 é o único código repetido.

**O que foi feito:** a Visão Geral (`lib/db/dashboard.ts`, `carregarModelo`)
ignora a tarefa sem detalhamentos cujo código coincide com o de uma irmã que
tem detalhamentos. Os dados no banco NÃO foram apagados.

**O que falta:** remover as cópias do banco. Adiado porque é irreversível e
precisa conferir antes se alguma tabela referencia esses `tarefas.id`
(cronograma, medições antigas, aditivos). A aba **Estrutura** lê o banco
direto e ainda pode mostrar as cópias.

**Quando aplicar:** na próxima vez que mexer na estrutura do orçamento ou
antes de qualquer reimportação. Conferir referências com:

```sql
select t.id, t.codigo, t.nome,
       (select count(*) from detalhamentos d where d.tarefa_id = t.id) as dets
from tarefas t
join grupos_macro g on g.id = t.grupo_macro_id
where g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  and trim(trailing '.' from t.codigo) in (
    select trim(trailing '.' from t2.codigo) from tarefas t2
    where t2.grupo_macro_id = t.grupo_macro_id
    group by 1 having count(*) > 1
  )
order by t.codigo;
```

## 2026-10-28 — "Saldo" da Visão Geral passou a ser Contratado − Realizado

**Decisão:** em Total, Material e Serviço a coluna **Saldo** é sempre
Contratado − Realizado (pedido do Alex: a linha tem que fechar na leitura).
A grandeza antiga virou coluna própria: **Med. s/ NF** (Serviço — medição
aprovada sem NF da Wave) e **Aprov. s/ NF** (Material — pedido aprovado sem
NF). O clique de origem "saldo" foi para essa coluna. Fonte única:
`valoresPorModo` em `lib/export/visao-geral.ts`.

## 2026-10-28 — % de serviço medido e alerta de faturamento FIP (Visão Geral)

**Decisão:** em Serviço e Material a Visão Geral mostra o **% de serviço
medido** do item = (medição aprovada + medição em aprovação) ÷ serviço
contratado. Em aprovação = `submetido`, `em_analise`, `autorizado`
(`MEDICAO_STATUS_EM_APROVACAO`). Quando parte do % vem de medição não
aprovada, o número fica azul com relógio e um aviso acima da tabela nomeia a
medição. Realizado e Saldo continuam contando só medição aprovada.

Em Material, o Realizado ganha "(x%)" = NF de material ÷ material
contratado. Se esse % (1 casa decimal) for menor que o % de serviço medido, o
Realizado fica laranja: a FIP está atrás no faturamento. O tooltip mostra o
valor a faturar = % serv. medido × material contratado − material faturado.

**Por que incluir a medição em aprovação no %:** pedido do Alex — o % serve
pra antecipar o faturamento da FIP; esperar a aprovação atrasa o alerta.
Fonte única: `percentuais()` em `lib/export/visao-geral.ts`.

**Limitação conhecida:** a comparação é por linha. No subtotal de um grupo,
itens adiantados compensam itens atrasados; o laranja por item é o que vale.
