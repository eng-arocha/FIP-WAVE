# Dívidas registradas

Decisões adiadas, com o motivo e o momento certo de aplicar — pra ninguém
reabrir a discussão do zero.

## ▶ Pendências em aberto (atualizado 28/10/2026)

Índice — o detalhe de cada uma está na seção indicada abaixo.

**Ações do Alex (operação)**
1. Lançar no site a NF Wave reemitida de R$ 479.560,54 no pedido nº 21
   (hoje só tem a NF 07 cancelada). → "MED-008: descontar R$ 31.916,58"
2. MED-008, antes de aprovar: gravar o ajuste de R$ 31.916,58 (MSF/Cordeiro
   do 1.3.1) quando as notas entrarem no Informakon — SQL pronto. Conferir o
   líquido do site com "Valor Líquido da Medição" do Informakon antes do
   pedido Wave. → mesma seção
3. 1.3.1: R$ 71.305,95 do pedido FIP #20 acima do contratado → DECIDIDO
   (28/10): vão inteiros para o 2.2.1 (100% do serviço medido, 100.759,72 de
   material sem pedido). Rodar o manual-fix 099 e conferir no Informakon que a
   NF 228 não está lançada só no grupo 1. Premissa conferida: pedidos
   aprovados sem NF seguem recebendo nota (NF consome o saldo do pedido).

**Decisões do Alex (regra)**
4. Regra dos próximos cortes: Informakon segue o % ajustado do site, OU o site
   sugere o % real e o corte vira ajuste automático na medição em que a nota
   entrar (recomendado). → "MED-008"
5. R$ 501,41 a mais da NF 228 e R$ 33,70 de descontos diversos: ficam só no
   total da MED-007 ou ganham rateio por item? (O 501,41 hoje aparece como
   −87,01 no 1.13.1, rateado pelos itens do #20.)

**Desenvolvimento (quando decidir / no próximo ciclo)**
6. Aprovação de medição: digitar os números da tela "Valores Financeiros" do
   Informakon e congelar — acaba com os manual-fix 095/096/097.
7. Implementar a regra do item 4.
8. Visão Geral: 19.1.1 mostra serviço −322 mil (item sem serviço contratado;
   a medição dele é contada como serviço) — erro de exibição.
9. Tarefas-fantasma duplicadas (1.6) no banco — a aba Estrutura ainda pode
   mostrá-las. → "Tarefas duplicadas no orçamento"

**Atenção na MED-008 (mudanças desta data que entram em vigor)**
- Trava de saldo por item em criação/edição/aprovação de pedido e no pedido
  FIP automático (corta o excedente e avisa).
- A FIP do grupo é rateada pela falta de cada item, não mais pelo material
  medido — o pedido FIP da MED-008 pode sair distribuído diferente da MED-007.

## 2026-10-28 — MED-008: descontar R$ 31.916,58 da MSF/Cordeiro (1.3.1)

**O que é:** na MED-007 o Informakon lançou o 1.3.1 (Painel de Média Tensão)
a 100%, sem as notas da MSF/Cordeiro. A Wave recebeu R$ 31.916,58 de material
como serviço (NF Wave reemitida por R$ 479.560,54). O site foi alinhado ao
Informakon no manual-fix 097: o snapshot do 1.3.1 está em 100% lançado, então
a camada ① NÃO vai propor esse desconto sozinha.

**Estado (28/10/2026):** 097 rodado e conferido — MED-007 = tela do
Informakon (lançado 1.834.551,81, material 1.263.229,98, retenção 91.727,59,
descontos diversos 33,70, líquido 479.560,54); livro-razão 91.727,59 nos dois
lados; pedido nº 21 = 479.560,54; NF nº 07 (449.761,62) cancelada. Falta
lançar no pedido nº 21 a NF reemitida de R$ 479.560,54.

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

**Regra para os próximos cortes (a decidir com o Alex):** ou o Informakon
segue o % ajustado do site, ou o site passa a sugerir o % real e transforma o
corte em ajuste automático na medição em que a nota entrar. Recomendação: a
segunda, porque é como a operação do Informakon já trabalha (MED-007). Até
decidir, conferir toda medição com corte contra a tela "Valores Financeiros"
do Informakon antes de emitir o pedido Wave.

**Melhoria sugerida:** na aprovação, digitar os números da tela "Valores
Financeiros" do Informakon (valor contratual, material, retenção, descontos
diversos, líquido) e congelar esses valores, em vez de corrigi-los depois por
SQL como no 095/096/097.

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

## 2026-10-28 — Itens de material acima do contratado (1.3.1, 3.1.1, 17.2.1)

Levantamento no filtro Material, só diferenças acima de R$ 1.000 (pedido
aprovado − material contratado do item):

| Item | Contratado | Comprometido | Estouro | Causa |
|---|---|---|---|---|
| 1.3.1 | 320.380,45 | 473.851,69 | 153.471,24 | Pedido FIP automático da MED-007 (26/10) |
| 3.1.1 | 17.732,89 | 26.421,74 | 8.688,85 | Pedido #895 ("Subsolo 01") vinculado ao Subsolo 04 |
| 17.2.1 | 2.256,18 | 5.932,09 | 3.675,91 | Pedido #1081 no item errado (17.1.1 tem exatamente 5.932,09 livres) |

**Por que a trava não segurou — três brechas no código:**

1. `criarSolicitacaoRascunhoDeMedicao` (lib/db/fat-direto.ts) cria o pedido
   FIP da medição JÁ APROVADO e sem checar limite ("a medição já foi
   validada" — mas a medição valida quantidade, não material comprometido).
   O valor vem de `classificarCoberturaPorBalde` (lib/db/desconto-material.ts):
   calcula a falta do grupo e RATEIA pelo material medido. O 1.3.1, maior
   material medido do grupo 1 e já 100% comprado (Novemp #1059 + #1085),
   recebeu 153.471,24. No grupo 1 inteiro só havia 104.179,23 livres e
   82.165,29 de material medido sem cobertura → 49.292,01 passam do contrato
   do grupo mesmo redistribuindo.
2. `PUT /fat-direto/solicitacoes/[solId]` apaga e regrava os itens sem
   checar limite, inclusive em pedido aprovado, e sem auditoria. Troca de
   item/valor depois da criação passa direto (provável caso do 17.2.1).
3. Até 29/07 (commit 1b5c770) a trava de criação usava material + serviço
   como teto do pedido de material. 3.1.1: #895 (8.688,85) + #987
   (17.732,89) = 26.421,74 < 31.375,93 (mat + serv) → passou.

**Proposta (antes da próxima medição):** travas nos três caminhos (pedido
automático da medição, edição, aprovação), rateio da FIP limitado ao saldo
livre de cada item, e correção dos três vínculos com decisão do Alex.

**Implementado em 28/10/2026 (travas):**
- `lib/db/limite-pedido.ts` — trava única por item (natureza, devoluções,
  compensação de lastro). Usada na criação, na EDIÇÃO (PUT, agora com
  auditoria `solicitacao_fat_direto.itens_editados`) e na APROVAÇÃO de pedido
  (o próprio pedido sai da conta). Erro 422 com mensagem legível em `error`.
- Pedido FIP automático da medição: corta o que passa do saldo livre de cada
  item e devolve o corte como alerta (`alerta_saldo` na autorização,
  `alertas` na aprovação). Nenhum item com saldo → pedido não é criado.
- Rateio da FIP do grupo (`classificarCoberturaPorBalde`): pela falta de cada
  item = (pendente + jaConsumido) − max(NF, aprovado). Item 100% comprado não
  recebe nota da FIP.

**Dados:** manual-fix `supabase/manual-fixes/098_realoca_pedidos_acima_do_contratado.sql`
(decisão do Alex 28/10/2026; conferido contra o 097 — sem conflito: o
desconto da MED-008 não lê a alocação dos pedidos e as realocações ficam
dentro do mesmo grupo). **Rodado e conferido em 28/10/2026** (blocos 1 e 3
batendo). Visão Geral: 3.1.1 e 17.2.1 zerados; único estouro > R$ 1.000 é o
1.3.1 (−71.305,95 comprometido; −54.862,94 de saldo de material faturado) —
pendência com a FIP. O 1.13.1 mostra −87,01: rateio dos R$ 501,41 que a NF
228 tem a mais que o pedido #20 (abaixo do corte de R$ 1.000).

**Plano original (decisão do Alex):**
- Pedido #20 (FIP, MED-007): realocar 153.471,24 do 1.3.1 → 82.165,29 para
  1.13.1/1.5.1/1.11.1/1.6.1/1.4.1/1.9.1/1.1.1; até 22.013,94 cabem como
  adiantamento no grupo 1; 49.292,01 fora do contrato (NF de devolução ou
  aditivo). A trava de edição aceita a realocação (exclui o próprio pedido).
- #895 → 3.1.4 (cabe 5.155,52; restante 3.533,33 → 3.1.15 ou 3.1.11).
- #1081 → 17.1.1 (cabe exato).
