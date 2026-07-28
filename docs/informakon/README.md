# Conciliação Informakon × FIP-WAVE

Fonte: `Controle_FIP_INFORMAKON_28JUL26.xlsx` (relatório de faturamento direto do
Informakon, extraído pela FIP em 28/07/2026).

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `nfs-fat-direto-28jul26.csv` | As 181 entradas de NF do Informakon já com o de-para para os grupos macro do FIP-WAVE e a indicação de em qual medição cada uma foi descontada |
| `../../supabase/manual-fixes/076_conciliacao_informakon.sql` | Blocos de conciliação para rodar no Supabase (somente leitura) |

## Estrutura da planilha

| Aba | Conteúdo |
|---|---|
| `faturamento direto global` | 181 entradas / 144 documentos / R$ 3.345.086,34. Colunas: `Nº Entrada` (chave), `Documento` (nº da NF), `Especificação` (macro item), `Vlr. a Desc` (saldo), `Vlr.Desc` (já descontado) |
| `medições serviço` | As 4 medições de serviço da Wave já emitidas, com valor contratual, material descontado, retenção e valor a pagar |
| `med 1` … `med 4` | Quais NFs foram descontadas em cada medição, com `% Desc` e `Valor D` |

## De-para de macro item

O Informakon identifica o macro item pelo texto da coluna `Especificação`
(`Faturamento direto - <MACRO ITEM>`).

| Especificação (Informakon) | Grupo FIP-WAVE |
|---|---|
| ELÉTRICA SUBESTAÇÃO | 1 |
| GERAÇÃO | 2 |
| ALIMENTAÇÃO ELÉTRICA | 3 |
| DISTRIBUIÇÃO ELÉTRICA | 4 |
| QUADROS ELÉTRICOS | 6 |
| LÓGICA (DADOS E VOZ) - INFRA SECA | 7 |
| ÁGUA PLUVIAL | 8 |
| ESGOTO | 9 |
| HIDRÁULICA | 10 |
| PISCINA E SPA | 12 |
| LOUÇAS E METAIS | 13 |
| COMBATE AO INCÊNDIO | 14 |
| SISTEMA DE DETECÇÃO E ALARME DE INCÊNDIO (SDAI) | 16 |
| GÁS | 17 |
| SISTEMA DE PROTEÇÃO CONTRA DESCARGA ATMOSFÉRICA | 18 |
| ADMINISTRAÇÃO OBRA | detalhamento **19.1.1** |
| FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS | detalhamento **19.1.2** |

Sem NF no Informakon: grupo **5** (LUMINÁRIAS) e grupo **15** (EXTINTOR E
SINALIZAÇÃO). Os grupos 11 e demais códigos ausentes não existem no contrato.

**Não é preciso o fornecedor vir do Informakon.** O de-para se faz pelo número da
nota (coluna `Documento`, ignorando o prefixo `NF-e` / `NFS-e`) contra
`notas_fiscais_fat_direto.numero_nf`. O emitente já está no FIP-WAVE — quem pode
devolver essa informação para a FIP somos nós.

## Posição em 28/07/2026

| | Valor |
|---|---|
| NF lançada no Informakon | 3.345.086,34 |
| Já descontado nas medições 1 a 4 | 928.368,80 |
| Saldo a descontar | 2.416.717,54 |

Descontado por medição: med 1 = 198.483,41 · med 2 = 97.532,80 ·
med 3 = 207.739,56 · med 4 = 424.613,03.

## Medições de serviço da Wave (aba `medições serviço`)

| Med | Nº Informakon | Contratual medido | (−) Material | (−) Retenção | (−) Diversos | Valor a pagar | NFS-e |
|---|---|---|---|---|---|---|---|
| 01 | 3340 | 337.748,98 | 198.483,41 | 16.887,45 | 0,68 | 122.377,44 | 1 |
| 02 | 3353 | 166.958,80 | 97.532,80 | 8.347,94 | 1,10 | 61.076,96 | 2 |
| 03 | 3366 | 500.644,83 | 207.739,56 | 25.032,24 | −0,69 | 267.873,72 | 3 |
| 04 | 3378 | 805.522,67 | 424.613,03 | 40.276,13 | 2,45 | 340.631,06 | 4 |

A retenção do Informakon é 5% sobre o **contratual medido bruto** (material +
serviço) — a mesma base da migration 052. `Descontos Diversos` é o arredondamento
de centavos.

## Divergência da medição 04

O **total medido bate**: 805.522,67 (Informakon) × 805.520,27 (FIP-WAVE) —
diferença de R$ 2,40, absorvida pelos `Descontos Diversos` de R$ 2,45.

O que diverge é a **composição material/serviço do mesmo total**:

| | Informakon | FIP-WAVE | Δ |
|---|---|---|---|
| Material | 424.613,03 | 413.071,59 | +11.541,44 |
| Serviço | 380.909,64 | 392.448,69 | −11.539,05 |
| **Total** | **805.522,67** | **805.520,27** | **+2,40** |

Os dois deltas se anulam (11.541,44 − 11.539,05 = 2,39 ≈ 2,40), o que confirma
que não há NF faltando: há um ou mais itens cujo rateio material/serviço no
orçamento do Informakon difere do nosso. O bloco `C4` do script de conciliação
localiza em qual grupo macro.
