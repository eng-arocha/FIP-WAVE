# Congelar os números do Informakon na aprovação + corte vira desconto posterior

**Status:** revisão 2 aprovada e implementada (28/10/2026): migration 086,
manual-fix 102. Pendente só o painel dedicado de pendentes (ver DIVIDAS item 7).
**Origem:** manual-fix 095/096/097 (MED-007) e a pendência da MSF/Cordeiro
(R$ 31.916,58) na MED-008. Ver docs/DIVIDAS.md.

## Problema

1. O site calcula a medição (contratual, material, retenção, líquido) e o
   Informakon calcula por fora. Quando divergem, hoje corrigimos depois, por
   SQL (095/096/097).
2. Quando falta lastro de NF no Informakon, o site corta o "% a lançar". Na
   MED-007 o Informakon lançou 100% mesmo assim; a Wave recebeu o material como
   serviço e o desconto ficou para a MED-008, anotado à mão em DIVIDAS.

## O que a leitura do código mudou

**R1. Não precisa de tabela nova de "desconto pendente".** A camada ① já
calcula o pendente por item: `material acumulado − Σ nf_material_descontada das
aprovadas` (`descontoPendenteDeLastro`, lib/db/desconto-material.ts). O snapshot
por item já é o livro do que foi descontado. Uma tabela à parte seria uma
segunda fonte para o mesmo número, e as duas iam divergir.

O que falta é separar duas coisas que hoje andam juntas na linha:
- **lançado** (entra no % e na retenção): hoje `serviço + nf_descontavel`;
- **descontado** (abate a NF Wave): `nf_descontavel`.

Com o "% real", o lançado passa a ser `serviço + material do período` (o
físico) e o desconto continua `nf_descontavel` — que pode ser menor (falta
lastro → vira pendente) ou maior (pendente antigo que ganhou lastro → desconto
sem %). É exatamente o "Material Fornecido a Descontar" do Informakon.

**R2. O 097 gravou o snapshot do 1.3.1 errado para este modelo.** Ele pôs
320.380,45 (100%) para o boletim reimpresso mostrar 100% lançado. Mas o
Informakon NÃO descontou a MSF na MED-007 — o material da tela (1.263.229,98)
fica R$ 806,32 acima do site (NF 228 + Administração), não R$ 31.916,58. O
snapshot certo do 1.3.1 é 288.463,87. Voltando ele, o pendente de 31.916,58
reaparece sozinho na MED-008, e com R1 o 1.3.1 continua mostrando 100% lançado.

**R3. Bug encontrado: o pedido Wave ignora `ajuste_material_anterior`.** A rota
de aprovação cria o pedido por `wave_bruto − débito de retenção`; só o e-mail
desconta o ajuste. O SQL anotado em DIVIDAS para a MED-008 (ajuste = 31.916,58)
geraria um pedido Wave R$ 31.916,58 acima. O item A abaixo resolve (pedido =
líquido congelado); até lá, o SQL de DIVIDAS NÃO deve ser usado.

**R4. A importação do relatório traz 4 campos, não 5.**
`informakon_medicoes_servico` tem contratual, material, retenção e a pagar.
Descontos diversos = contratual − material − retenção − a pagar (derivado). E o
relatório mais recente pode ainda não ter a medição → aí é digitado.

**R5. As colunas congeladas já são lidas com o significado do Informakon.**
Desde o 097, `valor_total` = contratual lançado e `valor_material_correspondente`
= material descontado; boletim, Visão Geral e conciliação fazem
`serviço = total − material`. Não precisa de coluna nova para os 4 primeiros
valores. Efeito colateral aceito: material sem lastro pago à Wave aparece como
serviço na Visão Geral até ser descontado (é o que de fato aconteceu).

## Proposta revisada

### A. Aprovação congela os números do Informakon

- Tela de aprovação (portão 2): bloco **"Valores Financeiros do Informakon"**
  com 5 campos: contratual lançado, material fornecido a descontar, retenção,
  descontos diversos, líquido. Ao lado, o número do site e a diferença.
- Pré-preenchido pela linha da medição no relatório importado (R4); senão,
  digitado.
- Validação no servidor: contratual − material − retenção − diversos = líquido
  (±0,01). Diferença site × Informakon > R$ 1,00 em qualquer campo exige
  justificativa (≥ 10 caracteres), gravada na auditoria.
- Ao aprovar, grava em `medicoes`: `valor_total`, `valor_material_correspondente`,
  `valor_retencao_garantia`, `ajuste_material_anterior` (= diversos, motivo
  "Descontos diversos do Informakon") e as colunas novas
  `informakon_liquido` + `informakon_valores_origem` ('importado'|'digitado').
- Livro-razão: crédito = retenção digitada (não mais 5% × base do site);
  débito como hoje. **Pedido Wave = líquido digitado** (corrige R3), itens
  rateados como hoje.
- Snapshot por item (`nf_material_descontada`) continua vindo do boletim
  (`nf_descontavel` de cada linha). A diferença entre o material do Informakon e
  a soma dos itens fica registrada na medição, sem rateio (como o 097 fez com os
  R$ 501,41 da NF 228). O pendente seguinte é limitado pelo lastro do ERP
  (camada ②), então essa sobra não gera desconto em dobro.
- A tela da medição aprovada passa a mostrar os 5 valores congelados.

### B. "% real" e corte vira desconto posterior

- Coluna nova `medicoes.regra_pct_real boolean default false`. Vale para
  medição aberta e para aprovada com a flag. MED-001 a 006 ficam como foram
  aprovadas (boletim reimpresso não muda); MED-007 recebe a flag (o Informakon
  lançou 100%).
- Com a regra: `a lançar = serviço do período + material do período` e `% a
  lançar = físico`. O desconto do item continua `nf_descontavel` depois da
  camada ② (limitado pelo lastro, com pendentes antigos).
- Retenção = 5% × lançado (inalterado na fórmula; muda a base porque o lançado
  sobe).
- Boletim mostra, por item, **"pendente sem lastro"** (material lançado ainda
  não descontado) e **"desconto de medição anterior"** (já existe:
  `recuperadoDeMedicoesAnteriores`). Painel no topo: total pendente por macro
  item e origem.
- Na medição em que a nota entra, o desconto aparece sozinho no item (camada ①
  + lastro do ERP) — não há "proposta" para aceitar: é o mesmo número que o
  Informakon vai descontar, e o item A confere os dois.
- Camada ③ (FIP emite/nota a caminho) não muda.

### Caso atual (manual-fix 102)

- `regra_pct_real = true` na MED-007.
- Snapshot do 1.3.1 na MED-007: 320.380,45 → 288.463,87 (R2). Totais
  congelados, livro-razão e pedido nº 21 não mudam.
- Conferência: o boletim da MED-007 continua com 1.3.1 a 100% e líquido
  479.560,54; a prévia da MED-008 mostra 31.916,58 pendente no 1.3.1.
- O SQL de ajuste manual em DIVIDAS fica cancelado.

## Teste de referência (MED-007)

Entrada: contratual 1.834.551,81; material 1.263.229,98; retenção 91.727,59;
diversos 33,70; líquido 479.560,54.
- Soma fecha (571.321,83 − 91.727,59 − 33,70 = 479.560,54).
- Errar um centavo no líquido → recusado.
- Pedido Wave = 479.560,54; crédito e débito de retenção = 91.727,59.
- Retenção do site com % real = 5% × lançado do site; a diferença para o
  Informakon (≈ 16,73, Administração) exige justificativa.
- 1.3.1 com regra nova: % a lançar 100%, desconto 288.463,87, pendente 31.916,58.
- MED-008 simulada com lastro de +31.916,58 no grupo 1: desconto do 1.3.1 =
  31.916,58, % do 1.3.1 inalterado, retenção não inclui esse valor.

## Riscos

- O líquido da NF Wave vem do número digitado. Mitigação: validação da soma,
  comparação com o site e justificativa acima de R$ 1,00.
- Com o % real, a Wave recebe material sem nota como serviço até a nota
  entrar. É a operação do Informakon hoje; o painel de pendentes deixa visível.
  Se a nota nunca vier, o pendente fica aberto até o encerramento.
- Medição aberta hoje (se houver) muda de % ao publicar — conferir antes.

## Plano de implementação

1. Migration 10x: `regra_pct_real`, `informakon_liquido`,
   `informakon_valores_origem` (idempotente; código resiliente à ausência).
2. `lib/medicao/valores-informakon.ts` (puro): validação da soma, diferenças
   site × Informakon, derivação de diversos a partir da importação. Testes com
   a MED-007.
3. aplicar-retrato / informacon-data: `a lançar` pelo físico quando a regra
   vale; campo `pendente_sem_lastro` por linha; testes com o 1.3.1.
4. Rota aprovar + `aprovarMedicao`: receber e validar os 5 valores, congelar,
   crédito de retenção = digitado, pedido Wave = líquido.
5. Tela de aprovação: bloco dos 5 valores (pré-preenchido) + justificativa.
6. Manual-fix 102 (MED-007) + atualizar DIVIDAS.
