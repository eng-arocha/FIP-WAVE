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
| FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS | detalhamento **19.1.2** (nome do item até a migration 078; o Informakon ainda usa este texto) |
| FURAÇÃO / PASSAGENS VIGAS E LAJES | detalhamento **19.1.2** (nome atual deste lado) |

Sem NF no Informakon: grupo **5** (LUMINÁRIAS) e grupo **15** (EXTINTOR E
SINALIZAÇÃO). Os grupos 11 e demais códigos ausentes não existem no contrato.

## Fornecedor

A aba `NFS WAVE GLOBAL` traz todos os lançamentos da obra (~10 mil linhas) com o
fornecedor. É de lá que sai o emitente de cada nota — o relatório de faturamento
direto não traz esse dado.

O cruzamento **não pode ser feito só por número**: NFS-e é numerada por
prestador, então `(tipo, número)` não é único. No relatório de 28/07/2026, 30 das
181 linhas casavam com mais de um fornecedor. A desambiguação é em cascata
(`resolverFornecedores` em `lib/informakon/parser.ts`):

1. **nome único** — todos os lançamentos daquele número são do mesmo fornecedor
2. **valor da linha** — o valor bate com exatamente um lançamento
3. **valor agregado** — a nota foi rateada em vários macro itens; a soma bate
4. **ambíguo** — não decide sozinho, pede confirmação

Com as três primeiras regras, as 181 linhas resolvem sem ambiguidade.

O nome **não é chave**: o mesmo Carmehil está cadastrado três vezes ("Carmehil
Comercial Elétrica Ltda", "CARMEHIL - COMERCIAL ELETRICA LTDA" e "... -
Network"), com código diferente em cada. Filial e matriz idem. Por isso os nomes
são reduzidos a uma raiz comum antes da comparação.

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

### Composição dos R$ 424.613,03 por fornecedor

| Fornecedor | Valor |
|---|---:|
| M. A. Frota & Cia Ltda | 78.583,06 |
| MUBEC INDUSTRIA E COMERCIO LTDA | 59.851,23 |
| Vtk Tubos e Conexoes em Aco Ltda | 56.841,77 |
| CACTUS COMERCIO E SERVICO DE MATERIAL ELETRICO | 47.993,77 |
| J MAURICIO DE VASCONCELOS SOUZA | 32.000,00 |
| MARCELO SILVEIRA DE SIQUEIRA SERVICOS DE ENGENHARIA | 27.000,00 |
| Sv Comércio de Material Elétrico Ltda | 25.772,22 |
| 65.659.717 ANTONIO GIBSON FERREIRA DE LIMA | 17.000,00 |
| Pl - Industria Metalurgica Ltda | 16.680,42 |
| Carmehil Comercial Elétrica Ltda | 13.628,05 |
| Msf Solucoes em Quadros Eletricos Ltda | 13.193,12 |
| M. L GUILHERMINO | 12.500,00 |
| CARMEHIL - COMERCIAL ELETRICA LTDA | 11.739,13 |
| Escala Com. de Moveis e Incorp. Ltda | 5.167,67 |
| Stock Comércio de Equip Ind e de Segurança Ltda | 4.714,85 |
| TF - TOP.FUSION INDUSTRIA DE TUBOS E CONEXOES | 1.907,97 |
| Carmehil Comercial Elétrica Ltda - Network | 39,77 |
| **Total** | **424.613,03** |

A **ADMINISTRAÇÃO DE OBRA** soma exatamente **R$ 76.000,00** em 6 notas de
serviço (NFS-e 87, 90, 91, 93, 5 e 6 — J Mauricio, Marcelo Silveira e Antonio
Gibson), o que confirma os 2 meses medidos no item 19.1.1.
