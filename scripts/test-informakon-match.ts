// Script de validação ad-hoc do matching Informakon.
// Roda com: npx tsx scripts/test-informakon-match.ts
import { getCodigoInformakon } from '../lib/data/informakon-codigos'

const CASOS: Array<{ desc: string; esperado: string | null; nota?: string }> = [
  // Casos do screenshot que estavam falhando
  { desc: 'SUBESTAÇÃO PMUC - INFRAESTRUTURA ( PMT até Subestação PMUC + Trafo ao CPG)', esperado: '1382/5' },
  { desc: 'ANEL INTERMEDIARIO  - SPDA -  2o PAV', esperado: '1382/320', nota: '2o vs 2°' },
  { desc: 'ANEL INTERMEDIARIO  - SPDA -  6o PAV', esperado: '1382/321' },
  { desc: 'ANEL INTERMEDIARIO  - SPDA -  10o PAV', esperado: '1382/322' },
  { desc: 'ANEL INTERMEDIARIO  - SPDA -  14o PAV', esperado: '1382/323' },

  // Casos que já funcionavam — checagem de regressão
  { desc: 'GRUPO GERADOR PMUC  - INFRAESTRUTURA  (  Eletrodutos )', esperado: '1382/17' },
  { desc: 'INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 01', esperado: '1382/56' },
  { desc: 'INFRA DADOS  - SUBSOLO 01', esperado: '1382/132' },
  { desc: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - TERREO', esperado: '1382/143' },
  { desc: 'TUBOS E CONEXÕES - ESGOTO  - TERREO', esperado: '1382/161' },
  { desc: 'ATERRAMENTO  - SPDA -  SUBSOLO 4', esperado: '1382/331' },
  { desc: 'SUBIDAS VERTICAIS ( DIVIDIDA POR VÃOS )', esperado: '1382/332' },

  // Truncados na fonte (Informakon)
  { desc: 'ENTRADA / SE PMUC / SE GRUPO A  - ATERRAMENTO ( Haste + Cabeamento + Fechamentos  )', esperado: '1382/4', nota: '1382/4 termina em "fechamen"' },
  { desc: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - PRUMADA VERTICAL ( Dividida em vãos - 48 vãos do 1° subsolo ate a coberta  )', esperado: '1382/138' },

  // Itens com prefixo abreviado
  { desc: 'ADMINISTRAÇÃO OBRA ( MÊS )', esperado: '1382/333', nota: 'Administração de Obras - Engenheiro Instalações' },
  { desc: 'FURAÇÃO / PASSAGENS VIGAS E LAJES', esperado: '1382/334' },
  { desc: 'FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS', esperado: '1382/334', nota: 'alias histórico — nome do item até a migration 078' },

  // Variações com acento removido / case
  { desc: 'subestação pmuc - cabeamento média ( pmt até subestação pmuc )', esperado: '1382/6' },

  // Quadro com texto mais longo entre parênteses
  { desc: 'QUADROS - SUBSOLO 04 + SUBSOLO 05 (QL 4 SUB - QF EX  4 SUB - QB DREN - QB IRRIG)', esperado: '1382/116', nota: '1382/116 truncado em "qb irr"' },
  { desc: 'QUADROS -TERREO (CM - QL GUA - QL TER - QD EMG - QB PRESS ESC E QB REC SEC)', esperado: '1382/120' },

  // Pavimentos tipo
  { desc: 'INSTALAÇÕES LUMINÁRIAS- PAV COBERTURA', esperado: '1382/100', nota: 'sem espaço antes do hífen' },

  // Hidráulica vs HIDRAULICA (sem acento)
  { desc: 'TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 04', esperado: null, nota: 'água fria/quente — pode não ter match certo' },
  { desc: 'TUBOS E CONEXÕES - HIDRAULICA  - PAVIMENTO TIPO  ( 1° AO 36° PAV )', esperado: null, nota: 'idem' },
]

let ok = 0
let fail = 0
for (const c of CASOS) {
  const got = getCodigoInformakon(c.desc)
  const passou = got === c.esperado
  const symb = passou ? '✓' : '✗'
  console.log(`${symb} esperado=${c.esperado ?? 'null'} got=${got ?? 'null'}  | ${c.desc.slice(0, 70)}${c.nota ? ` (${c.nota})` : ''}`)
  if (passou) ok++; else fail++
}
console.log(`\n${ok} ok / ${fail} falhas`)
