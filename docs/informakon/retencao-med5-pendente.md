# Retenção da MED-005 fora do livro-razão — decisão em espera

**Registrado em:** 22/10/2026 · **Status:** decisão tomada — seguir o Informakon.
Correção de dados em `supabase/manual-fixes/092_regularizar_med5_pedido_nf_wave_e_retencao.sql`
(o usuário roda no SQL Editor). Correção de código ainda pendente.

## Sintoma

Dashboard, com a simulação da MED-007 ligada: Medição Total 37,0% do contrato, mas
Retenção Contratual 30,6% do previsto (R$ 275.358,36 de R$ 900.000,00). Como a
regra é 5% global sobre material + serviço, os dois percentuais deveriam ser iguais.

## Causa (confirmada no banco)

O livro-razão (`retencao_movimentos`) tem crédito e débito das MED-001, 002, 003,
004 e 006. **A MED-005 não tem nenhum movimento.** A soma dos créditos existentes
(R$ 182.106,93) é exatamente o card sem a MED-007.

A aprovação da MED-005 (09/09/2026) não conseguiu recalcular o boletim — o mesmo
problema registrado em `supabase/manual-fixes/089_reconstruir_snapshot_desconto_med5.sql`.
Em `app/api/contratos/[id]/medicoes/[medicaoId]/aprovar/route.ts` a medição vira
"aprovado" antes, e o bloco que grava crédito/débito de retenção e cria o pedido
Wave é best-effort: falhou em silêncio. Ficaram de fora:

- crédito e débito de retenção da MED-005;
- o pedido `wave_servico` da MED-005;
- por consequência, a NF Wave nº 5 nunca foi lançada no site (as lançadas são 1, 2, 3, 4 e 6).

A tela `/contratos/[id]/retencao` mascarou o buraco: na tabela "Por Medição" ela
mostra estimativa de 5% quando falta crédito no livro-razão.

## Fatos do Informakon (ERP) — MED-005

| Campo | Valor |
|---|---|
| Valor contratual da medição (base) | 1.094.690,67 |
| (−) Material fornecido | 645.249,89 |
| Valor da medição (serviço) | 449.440,78 |
| (−) Retenção 5% | **54.734,53** |
| (−) Descontos diversos | 0,45 |
| **NF de serviço nº 5 (líquido)** | **394.705,80** |

A Wave **recebeu com a retenção descontada** — o dinheiro está certo; o site é que
não registrou.

## Divergência site × ERP na MED-005

| | Site | Informakon | Diferença |
|---|---|---|---|
| Material | 657.540,91 | 645.249,89 | 12.291,02 |
| Serviço | 487.664,53 | 449.440,78 | 38.223,75 |
| Base | 1.145.205,44 | 1.094.690,67 | 50.514,77 |
| Retenção 5% | 57.260,27 | 54.734,53 | 2.525,74 |

- Material: esperado — o ERP só desconta material com NF (lastro); o corte volta depois.
- Serviço: **CORREÇÃO (prévia do 092):** o serviço medido no site é R$ 449.440,33, igual
  ao do ERP (449.440,78; diferença de 0,45 = "descontos diversos"). A conta acima, que
  derivou o serviço de `valor_total − material`, estava errada. A diferença de base
  R$ 50.514,77 é toda de **material** — material medido no site que o ERP não descontou
  por falta de lastro. Comportamento esperado; não há serviço a investigar na MED-005.

## Correção proposta (aguardando decisão)

1. Criar pedido `wave_servico` da MED-005, aprovado, R$ 394.705,80.
2. Lançar nele a NF nº 5, R$ 394.705,80 (data de emissão: pedir ao usuário; na falta, 09/09/2026).
3. Livro-razão: crédito R$ 54.734,53 (origem MED-005) + débito R$ 54.734,53. Saldo segue zero; nada muda para a Wave.

Executar como `supabase/manual-fixes/0xx_*.sql` com bloco 1 (prévia) e bloco 2 (gravação).

Resultado esperado: retenção do card R$ 330.092,89 (36,7%); residual de R$ 2.525,74
passa a ser divergência conhecida site × ERP, não medição sumida.

## Decisões pendentes do usuário

1. ~~Retenção do site espelha o ERP ou a regra física?~~ **Decidido 22/10/2026: espelha o ERP (R$ 54.734,53).**
   Motivo: é o que foi retido e pago de fato; a regra física criaria R$ 2.525,74 a cobrar da Wave
   sobre serviço cuja diferença site × ERP ainda não foi explicada.
2. Data de emissão da NF nº 5 — não informada; o 092 usa 09/09/2026, corrigível na tela da NF.
3. Investigar os R$ 38.223,75 de serviço da MED-005 e os R$ 6.019,82 da NF da MED-006
   (NF 591.790,96 × pedido 597.810,78) — recomendado antes de aprovar a MED-007.

## Correção de código (também pendente)

- Aprovação não pode concluir em silêncio sem gravar retenção e pedido Wave.
- "Desfazer aprovação" (`lib/db/medicao-revisao.ts`) não estorna a retenção — reaprovar credita em dobro.
- Tela de Retenção deve mostrar "sem retenção registrada" em vez de estimar 5%.

## Contexto descartado

A diferença Medição de Serviço 38,5% × Material Medido 36,0% **não é bug**: em cada
item os dois avançam juntos (qtde × preço unitário); no agregado diferem pelo mix de
itens executados. O usuário pediu para não mexer nos cards.
