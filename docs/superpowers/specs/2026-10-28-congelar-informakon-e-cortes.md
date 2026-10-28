# Congelar os números do Informakon na aprovação + corte vira ajuste automático

**Status:** proposta — aguardando OK do Alex antes de implementar.
**Origem:** manual-fix 095/096/097 (MED-007) e a pendência da MSF/Cordeiro
(R$ 31.916,58) na MED-008. Ver docs/DIVIDAS.md.

## Problema

1. O site calcula a medição (contratual, material, retenção, líquido) e o
   Informakon calcula por fora. Quando divergem, hoje corrigimos depois, por
   SQL (095/096/097).
2. Quando falta lastro de NF no Informakon, o site sugere um % menor
   ("corte"). Na MED-007 o Informakon lançou 100% mesmo assim; a Wave
   recebeu o material como serviço e o desconto ficou para a MED-008, anotado
   à mão em docs/DIVIDAS.md.

## Proposta

### A. Aprovação congela os números do Informakon

- Na tela de aprovação (portão 2), bloco **"Valores Financeiros do
  Informakon"** com 5 campos: valor contratual lançado, material fornecido,
  retenção, descontos diversos, líquido.
- Pré-preenchido pela importação do relatório do Informakon quando existir
  (`lib/db/medicao-conciliacao-informakon.ts`, migration 075); senão, digitado.
- Validação: contratual − material − retenção − diversos = líquido (±0,01).
- Ao aprovar, grava esses valores em `medicoes` (valor_total,
  valor_material_correspondente, valor_retencao_garantia,
  ajuste_material_anterior) e usa o **líquido** para o pedido Wave e o
  **valor de retenção** para o livro-razão — o mesmo que o 097 fez por SQL.
- Diferença site × Informakon acima de R$ 1,00 exige justificativa (texto),
  gravada na auditoria.

### B. Corte vira ajuste automático

- O site passa a sugerir o **% real** (físico) no "% a lançar" — sem corte
  por falta de lastro.
- O material medido SEM lastro de NF no Informakon na aprovação vira um
  **desconto pendente** do item (nova tabela `desconto_material_pendente`:
  contrato, detalhamento, medição de origem, valor, valor_baixado).
- Na medição seguinte, quando NF do item entrar (lastro novo no
  Informakon/site), o boletim **propõe** `ajuste_material_anterior` =
  min(pendente, NF nova do item) e mostra de onde veio. O aprovador confirma
  (não aplica sozinho).
- Pendente baixado ao aprovar a medição que o descontou.

### Migração do caso atual

- Cadastrar a MSF/Cordeiro como primeiro pendente: 1.3.1, origem MED-007,
  R$ 31.916,58 — substitui o SQL manual anotado em DIVIDAS.

## Riscos

- Muda o valor da NF Wave: o líquido passa a vir do Informakon digitado.
  Erro de digitação = NF errada → por isso a validação da soma e a
  justificativa.
- "% real" no site passa a bater com o Informakon, mas o pendente precisa
  ser baixado na medição certa; se a NF nunca vier, o pendente fica aberto
  (relatório de pendentes + decisão no encerramento).

## Plano de implementação (sessão nova)

1. Migration: `desconto_material_pendente` (idempotente) + seed do pendente
   da MSF/Cordeiro.
2. `lib/db/desconto-pendente.ts` (puro + loader) com testes.
3. informacon-data: remover o corte do "% a lançar"; calcular pendente gerado
   e proposta de baixa.
4. Rota de aprovação: aceitar os 5 valores, validar, congelar, usar no pedido
   Wave e no livro-razão; gerar/baixar pendentes.
5. Tela de aprovação: bloco de valores do Informakon + proposta de ajuste.
6. Testes com os números da MED-007 (097) como caso de referência.
