// Mapeamento autoritativo (descrição do item do contrato → código CT/Serv
// Informakon 1382/N) fornecido pelo usuário em 2026-05-04. Cobre os 335
// itens do contrato WAVE-2025-001.
//
// Item 10.1.7 (TUBOS E CONEXÕES - HIDRÁULICA - SOBRESOLO 01) ainda está
// pendente — null aqui, mostra "—" na UI até confirmação.
//
// O lookup é por descrição (fingerprint alfanumérico, lowercase, sem
// acentos) — robusto a variações de whitespace e maiúsculas/minúsculas.

interface MapEntry {
  codigoApp: string                  // ex.: "1.1.1" — só pra documentação
  descricao: string                  // descrição como aparece no app/banco
  codigoInformakon: string | null    // ex.: "1382/1" ou null
}

const MAPEAMENTO: MapEntry[] = [
  // === Grupo 1 — Elétrica subestação ===
  { codigoApp: '1.1.1',  descricao: 'ENTRADA DE ENERGIA - INFRAESTRUTURA ( Poste ao PMT )',                                              codigoInformakon: '1382/1' },
  { codigoApp: '1.2.1',  descricao: 'ENTRADA DE ENERGIA - CABEAMENTO MÉDIA ( Poste ao PMT  )',                                            codigoInformakon: '1382/2' },
  { codigoApp: '1.3.1',  descricao: 'ENTRADA DE ENERGIA - EQUIPAMENTOS( Painel de Média Tensão  )',                                       codigoInformakon: '1382/3' },
  { codigoApp: '1.4.1',  descricao: 'SUBESTAÇÃO PMUC - INFRAESTRUTURA ( PMT até Subestação PMUC + Trafo ao CPG)',                         codigoInformakon: '1382/5' },
  { codigoApp: '1.5.1',  descricao: 'SUBESTAÇÃO PMUC - CABEAMENTO MÉDIA ( PMT até Subestação PMUC )',                                     codigoInformakon: '1382/6' },
  { codigoApp: '1.6.1',  descricao: 'SUBESTAÇÃO PMUC - EQUIPAMENTO ( Tranformadores e fechamentos )',                                     codigoInformakon: '1382/7' },
  { codigoApp: '1.7.1',  descricao: "SUBESTAÇÃO PMUC - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG's )",                            codigoInformakon: '1382/8' },
  { codigoApp: '1.8.1',  descricao: "SUBESTAÇÃO PMUC - QUADROS ( CPG's )",                                                                codigoInformakon: '1382/9' },
  { codigoApp: '1.9.1',  descricao: 'SUBESTAÇÃO GRUPO A  - INFRAESTRUTURA ( PMT até Subestação GRUPO A  )',                               codigoInformakon: '1382/10' },
  { codigoApp: '1.10.1', descricao: 'SUBESTAÇÃO GRUPO A  - CABEAMENTO MÉDIA ( PMT até Subestação GRUPO A  )',                             codigoInformakon: '1382/11' },
  { codigoApp: '1.11.1', descricao: 'SUBESTAÇÃO GRUPO A  - EQUIPAMENTO ( Tranformador e fechamentos )',                                   codigoInformakon: '1382/12' },
  { codigoApp: '1.12.1', descricao: "SUBESTAÇÃO GRUPO A  - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG')",                          codigoInformakon: '1382/13' },
  { codigoApp: '1.13.1', descricao: 'SUBESTAÇÃO GRUPO A  - QUADROS ( CPG )',                                                              codigoInformakon: '1382/14' },
  { codigoApp: '1.14.1', descricao: 'ENTRADA / SE PMUC / SE GRUPO A  - ATERRAMENTO ( Haste + Cabeamento + Fechamentos  )',                codigoInformakon: '1382/4' },

  // === Grupo 2 — Geração ===
  { codigoApp: '2.1.1',  descricao: 'GRUPO GERADOR PMUC  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )',                                codigoInformakon: '1382/15' },
  { codigoApp: '2.2.1',  descricao: "GRUPO GERADOR PMUC  - PAINEIS (  QTA's + Quadros reversão )",                                        codigoInformakon: '1382/16' },
  { codigoApp: '2.3.1',  descricao: 'GRUPO GERADOR PMUC  - INFRAESTRUTURA  (  Eletrodutos )',                                             codigoInformakon: '1382/17' },
  { codigoApp: '2.4.1',  descricao: 'GRUPO GERADOR PMUC  - CABEAMENTO BAIXA TENSÃO + COMANDO',                                            codigoInformakon: '1382/18' },
  { codigoApp: '2.5.1',  descricao: 'GRUPO GERADOR CONDOMINIO  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )',                          codigoInformakon: '1382/19' },
  { codigoApp: '2.6.1',  descricao: 'GRUPO GERADOR CONDOMINIO  - PAINEIS (  QTA EMERG + QTA QDC + QDG GERADOR )',                         codigoInformakon: '1382/20' },
  { codigoApp: '2.7.1',  descricao: 'GRUPO GERADOR CONDOMINIO  - INFRAESTRUTURA  (  Eletrodutos )',                                       codigoInformakon: '1382/21' },
  { codigoApp: '2.8.1',  descricao: 'GRUPO GERADOR CONDOMINIO  - CABEAMENTO BAIXA TENSÃO + COMANDO',                                      codigoInformakon: '1382/22' },
  { codigoApp: '2.9.1',  descricao: 'GRUPO GERADOR PMUC + CONDOMINIO  - ATERRAMENTO',                                                     codigoInformakon: '1382/23' },

  // === Grupo 3.1 — Infra alimentação elétrica ===
  { codigoApp: '3.1.1',  descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 04',                                                            codigoInformakon: '1382/34' },
  { codigoApp: '3.1.2',  descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 03',                                                            codigoInformakon: '1382/35' },
  { codigoApp: '3.1.3',  descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 02',                                                            codigoInformakon: '1382/36' },
  { codigoApp: '3.1.4',  descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 01',                                                            codigoInformakon: '1382/37' },
  { codigoApp: '3.1.5',  descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - TERREO',                                                                codigoInformakon: '1382/38' },
  { codigoApp: '3.1.6',  descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 01',                                                          codigoInformakon: '1382/39' },
  { codigoApp: '3.1.7',  descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 02',                                                          codigoInformakon: '1382/40' },
  { codigoApp: '3.1.8',  descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 03',                                                          codigoInformakon: '1382/41' },
  { codigoApp: '3.1.9',  descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - LAZER',                                                                 codigoInformakon: '1382/42' },
  { codigoApp: '3.1.10', descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - PANORAMICO',                                                            codigoInformakon: '1382/43' },
  { codigoApp: '3.1.11', descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )',                                                 codigoInformakon: '1382/44' },
  { codigoApp: '3.1.12', descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - PAV COBERTURA',                                                         codigoInformakon: '1382/45' },
  { codigoApp: '3.1.13', descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP',                                        codigoInformakon: '1382/46' },
  { codigoApp: '3.1.14', descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - PAV CASA DE MAQUINAS',                                                  codigoInformakon: '1382/47' },
  { codigoApp: '3.1.15', descricao: 'INFRA ALIMENTAÇÃO ELÉTRICA - INFRA VERTICAL ( DIVIDIDO POR VÃOS ENTRE PAVIMENTOS )',                 codigoInformakon: '1382/48' },

  // === Grupo 3.2 — Cabeamento alimentação elétrica ===
  { codigoApp: '3.2.1',  descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 04',                                                       codigoInformakon: '1382/49' },
  { codigoApp: '3.2.2',  descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 03',                                                       codigoInformakon: '1382/50' },
  { codigoApp: '3.2.3',  descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 02',                                                       codigoInformakon: '1382/51' },
  { codigoApp: '3.2.4',  descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 01',                                                       codigoInformakon: '1382/52' },
  { codigoApp: '3.2.5',  descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - TERREO',                                                           codigoInformakon: '1382/24' },
  { codigoApp: '3.2.6',  descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 01',                                                     codigoInformakon: '1382/25' },
  { codigoApp: '3.2.7',  descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 02',                                                     codigoInformakon: '1382/26' },
  { codigoApp: '3.2.8',  descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 03',                                                     codigoInformakon: '1382/27' },
  { codigoApp: '3.2.9',  descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - LAZER',                                                            codigoInformakon: '1382/28' },
  { codigoApp: '3.2.10', descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PANORAMICO',                                                       codigoInformakon: '1382/29' },
  { codigoApp: '3.2.11', descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )',                                            codigoInformakon: '1382/30' },
  { codigoApp: '3.2.12', descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV COBERTURA',                                                    codigoInformakon: '1382/31' },
  { codigoApp: '3.2.13', descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP',                                   codigoInformakon: '1382/32' },
  { codigoApp: '3.2.14', descricao: 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV CASA DE MAQUINAS',                                             codigoInformakon: '1382/33' },

  // === Grupo 4.1 — Infra distribuição elétrica ===
  { codigoApp: '4.1.1',  descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 04 + SUBSOLO 05',                                              codigoInformakon: '1382/53' },
  { codigoApp: '4.1.2',  descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 03',                                                           codigoInformakon: '1382/54' },
  { codigoApp: '4.1.3',  descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 02',                                                           codigoInformakon: '1382/55' },
  { codigoApp: '4.1.4',  descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 01',                                                           codigoInformakon: '1382/56' },
  { codigoApp: '4.1.5',  descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - TERREO',                                                               codigoInformakon: '1382/57' },
  { codigoApp: '4.1.6',  descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 01',                                                         codigoInformakon: '1382/58' },
  { codigoApp: '4.1.7',  descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 02',                                                         codigoInformakon: '1382/59' },
  { codigoApp: '4.1.8',  descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 03',                                                         codigoInformakon: '1382/60' },
  { codigoApp: '4.1.9',  descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - LAZER',                                                                codigoInformakon: '1382/61' },
  { codigoApp: '4.1.10', descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - PANORAMICO',                                                           codigoInformakon: '1382/62' },
  { codigoApp: '4.1.11', descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )',                                                codigoInformakon: '1382/63' },
  { codigoApp: '4.1.12', descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - PAV COBERTURA',                                                        codigoInformakon: '1382/64' },
  { codigoApp: '4.1.13', descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP',                                       codigoInformakon: '1382/65' },
  { codigoApp: '4.1.14', descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - PAV CASA DE MAQUINAS',                                                 codigoInformakon: '1382/66' },
  { codigoApp: '4.1.15', descricao: 'INFRA DISTRIBUIÇÃO ELÉTRICA - HELIPONTO',                                                            codigoInformakon: '1382/67' },

  // === Grupo 4.2 — Cabeamento distribuição elétrica ===
  { codigoApp: '4.2.1',  descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 04 + SUBSOLO 05',                                         codigoInformakon: '1382/68' },
  { codigoApp: '4.2.2',  descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 03',                                                      codigoInformakon: '1382/69' },
  { codigoApp: '4.2.3',  descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 02',                                                      codigoInformakon: '1382/70' },
  { codigoApp: '4.2.4',  descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 01',                                                      codigoInformakon: '1382/71' },
  { codigoApp: '4.2.5',  descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - TERREO',                                                          codigoInformakon: '1382/72' },
  { codigoApp: '4.2.6',  descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 01',                                                    codigoInformakon: '1382/73' },
  { codigoApp: '4.2.7',  descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 02',                                                    codigoInformakon: '1382/74' },
  { codigoApp: '4.2.8',  descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 03',                                                    codigoInformakon: '1382/75' },
  { codigoApp: '4.2.9',  descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - LAZER',                                                           codigoInformakon: '1382/76' },
  { codigoApp: '4.2.10', descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PANORAMICO',                                                      codigoInformakon: '1382/77' },
  { codigoApp: '4.2.11', descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )',                                           codigoInformakon: '1382/78' },
  { codigoApp: '4.2.12', descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV COBERTURA',                                                   codigoInformakon: '1382/79' },
  { codigoApp: '4.2.13', descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP',                                  codigoInformakon: '1382/80' },
  { codigoApp: '4.2.14', descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV CASA DE MAQUINAS',                                            codigoInformakon: '1382/81' },
  { codigoApp: '4.2.15', descricao: 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - HELIPONTO',                                                       codigoInformakon: '1382/82' },

  // === Grupo 4.3 — Acabamento distribuição elétrica (mapeia em "tomadas e interruptores") ===
  { codigoApp: '4.3.1',  descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 04 + SUBSOLO 05',                                         codigoInformakon: '1382/83' },
  { codigoApp: '4.3.2',  descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 03',                                                      codigoInformakon: '1382/84' },
  { codigoApp: '4.3.3',  descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 02',                                                      codigoInformakon: '1382/85' },
  { codigoApp: '4.3.4',  descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 01',                                                      codigoInformakon: '1382/86' },
  { codigoApp: '4.3.5',  descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - TERREO',                                                          codigoInformakon: '1382/87' },
  { codigoApp: '4.3.6',  descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 01',                                                    codigoInformakon: '1382/88' },
  { codigoApp: '4.3.7',  descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 02',                                                    codigoInformakon: '1382/89' },
  { codigoApp: '4.3.8',  descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 03',                                                    codigoInformakon: '1382/90' },
  { codigoApp: '4.3.9',  descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - LAZER',                                                           codigoInformakon: '1382/91' },
  { codigoApp: '4.3.10', descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PANORAMICO',                                                      codigoInformakon: '1382/92' },
  { codigoApp: '4.3.11', descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )',                                           codigoInformakon: '1382/93' },
  { codigoApp: '4.3.12', descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV COBERTURA',                                                   codigoInformakon: '1382/94' },
  { codigoApp: '4.3.13', descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP',                                  codigoInformakon: '1382/95' },
  { codigoApp: '4.3.14', descricao: 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV CASA DE MAQUINAS',                                            codigoInformakon: '1382/96' },

  // === Grupo 5 — Luminárias ===
  { codigoApp: '5.1.1',  descricao: 'INSTALAÇÕES LUMINÁRIAS - SUBSOLO 04 + SUBSOLO 05',                                                   codigoInformakon: '1382/97' },
  { codigoApp: '5.1.2',  descricao: 'INSTALAÇÕES LUMINÁRIAS - SUBSOLO 03',                                                                codigoInformakon: '1382/104' },
  { codigoApp: '5.1.3',  descricao: 'INSTALAÇÕES LUMINÁRIAS - SUBSOLO 02',                                                                codigoInformakon: '1382/105' },
  { codigoApp: '5.1.4',  descricao: 'INSTALAÇÕES LUMINÁRIAS - SUBSOLO 01',                                                                codigoInformakon: '1382/106' },
  { codigoApp: '5.1.5',  descricao: 'INSTALAÇÕES LUMINÁRIAS - TERREO',                                                                    codigoInformakon: '1382/107' },
  { codigoApp: '5.1.6',  descricao: 'INSTALAÇÕES LUMINÁRIAS - SOBRESOLO 01',                                                              codigoInformakon: '1382/108' },
  { codigoApp: '5.1.7',  descricao: 'INSTALAÇÕES LUMINÁRIAS - SOBRESOLO 02',                                                              codigoInformakon: '1382/109' },
  { codigoApp: '5.1.8',  descricao: 'INSTALAÇÕES LUMINÁRIAS - SOBRESOLO 03',                                                              codigoInformakon: '1382/110' },
  { codigoApp: '5.1.9',  descricao: 'INSTALAÇÕES LUMINÁRIAS - LAZER',                                                                     codigoInformakon: '1382/111' },
  { codigoApp: '5.1.10', descricao: 'INSTALAÇÕES LUMINÁRIAS - PANORAMICO',                                                                codigoInformakon: '1382/98' },
  { codigoApp: '5.1.11', descricao: 'INSTALAÇÕES LUMINÁRIAS - PAV TIPO ( 1° AO 36 )',                                                     codigoInformakon: '1382/99' },
  { codigoApp: '5.1.12', descricao: 'INSTALAÇÕES LUMINÁRIAS- PAV COBERTURA',                                                              codigoInformakon: '1382/100' },
  { codigoApp: '5.1.13', descricao: 'INSTALAÇÕES LUMINÁRIAS- PAV ROOFTOP + MEZANINO ROOFTOP',                                             codigoInformakon: '1382/101' },
  { codigoApp: '5.1.14', descricao: 'INSTALAÇÕES LUMINÁRIAS - PAV CASA DE MAQUINAS',                                                      codigoInformakon: '1382/102' },
  { codigoApp: '5.1.15', descricao: 'INSTALAÇÕES LUMINÁRIAS - HELIPONTO',                                                                 codigoInformakon: '1382/103' },

  // === Grupo 6 — Quadros ===
  { codigoApp: '6.1.1',  descricao: 'QUADROS - SUBSOLO 04 + SUBSOLO 05 (QL 4 SUB - QF EX  4 SUB - QB DREN - QB IRRIG)',                   codigoInformakon: '1382/116' },
  { codigoApp: '6.1.2',  descricao: 'QUADROS - SUBSOLO 03 (QL 3 SUB - QF EX  3 SUB)',                                                     codigoInformakon: '1382/117' },
  { codigoApp: '6.1.3',  descricao: 'QUADROS - SUBSOLO 02 (QL 2 SUB - QF EX  2 SUB)',                                                     codigoInformakon: '1382/118' },
  { codigoApp: '6.1.4',  descricao: 'QUADROS - SUBSOLO 01 (QL 1 SUB - QF EX  1 SUB - QB ESPELHO)',                                        codigoInformakon: '1382/119' },
  { codigoApp: '6.1.5',  descricao: 'QUADROS -TERREO (CM - QL GUA - QL TER - QD EMG - QB PRESS ESC E QB REC SEC)',                        codigoInformakon: '1382/120' },
  { codigoApp: '6.1.6',  descricao: 'QUADROS - SOBRESOLO 01 (QL 1 SOBR)',                                                                 codigoInformakon: '1382/121' },
  { codigoApp: '6.1.7',  descricao: 'QUADROS - SOBRESOLO 02 (QL 2 SOBR E QDC)',                                                           codigoInformakon: '1382/122' },
  { codigoApp: '6.1.8',  descricao: 'QUADROS - SOBRESOLO 03 (QL 3 SOBR E QB PISC)',                                                       codigoInformakon: '1382/123' },
  { codigoApp: '6.1.9',  descricao: 'QUADROS - LAZER (QL 3 SOBR E QB PISC)',                                                              codigoInformakon: '1382/124' },
  { codigoApp: '6.1.10', descricao: 'QUADROS - PANORAMICO (QL PAN - QL FAC - QEUDE)',                                                     codigoInformakon: '1382/125' },
  { codigoApp: '6.1.11', descricao: 'QL TIPO (36 VEZES)',                                                                                  codigoInformakon: '1382/112' },
  { codigoApp: '6.1.12', descricao: 'QUADROS - COBERTURA (QL COBERT - QB SUPERIOR)',                                                      codigoInformakon: '1382/113' },
  { codigoApp: '6.1.13', descricao: 'QUADROS MEZANINO (QL ROOFT - QFAC ROOTF - QL PAV 2)',                                                codigoInformakon: '1382/114' },
  { codigoApp: '6.1.14', descricao: 'QUADROS CASA MAQUINAS (QL ROOFT - QFAC ROOTF - QL PAV 2)',                                           codigoInformakon: '1382/115' },

  // === Grupo 7 — Infra dados ===
  { codigoApp: '7.1.1',  descricao: 'INFRA DADOS - SUBSOLO 04',                                                                            codigoInformakon: '1382/129' },
  { codigoApp: '7.1.2',  descricao: 'INFRA DADOS  - SUBSOLO 03',                                                                           codigoInformakon: '1382/130' },
  { codigoApp: '7.1.3',  descricao: 'INFRA DADOS  - SUBSOLO 02',                                                                           codigoInformakon: '1382/131' },
  { codigoApp: '7.1.4',  descricao: 'INFRA DADOS  - SUBSOLO 01',                                                                           codigoInformakon: '1382/132' },
  { codigoApp: '7.1.5',  descricao: 'INFRA DADOS  - TERREO',                                                                               codigoInformakon: '1382/133' },
  { codigoApp: '7.1.6',  descricao: 'INFRA DADOS  - SOBRESOLO 01',                                                                         codigoInformakon: '1382/134' },
  { codigoApp: '7.1.7',  descricao: 'INFRA DADOS - SOBRESOLO 02',                                                                          codigoInformakon: '1382/135' },
  { codigoApp: '7.1.8',  descricao: 'INFRA DADOS  - SOBRESOLO 03',                                                                         codigoInformakon: '1382/136' },
  { codigoApp: '7.1.9',  descricao: 'INFRA DADOS  - LAZER',                                                                                codigoInformakon: '1382/137' },
  { codigoApp: '7.1.10', descricao: 'INFRA DADOS  - PAV TIPO ( 1° AO 36 )',                                                                codigoInformakon: '1382/126' },
  { codigoApp: '7.1.11', descricao: 'INFRA DADOS  - PAV COBERTURA',                                                                        codigoInformakon: '1382/127' },
  { codigoApp: '7.1.12', descricao: 'INFRA DADOS  - PAV ROOFTOP + MEZANINO ROOFTOP',                                                       codigoInformakon: '1382/128' },

  // === Grupo 8 — Águas pluviais ===
  { codigoApp: '8.1.1',  descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - PRUMADA VERTICAL ( Dividida em vãos - 48 vãos do 1° subsolo ate a coberta  )', codigoInformakon: '1382/138' },
  { codigoApp: '8.1.2',  descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 04 ( RECALQUE DRENAGEM + DRENO AR CONDICIONADO )',       codigoInformakon: '1382/139' },
  { codigoApp: '8.1.3',  descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 03 ( RECALQUE DRENAGEM + DRENO AR CONDICIONADO )',       codigoInformakon: '1382/140' },
  { codigoApp: '8.1.4',  descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 02 (  DRENO AR CONDICIONADO )',                          codigoInformakon: '1382/141' },
  { codigoApp: '8.1.5',  descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 01 (  DRENO AR CONDICIONADO )',                          codigoInformakon: '1382/142' },
  { codigoApp: '8.1.6',  descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - TERREO',                                                          codigoInformakon: '1382/143' },
  { codigoApp: '8.1.7',  descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SOBRESOLO 01',                                                    codigoInformakon: '1382/144' },
  { codigoApp: '8.1.8',  descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SOBRESOLO 02',                                                    codigoInformakon: '1382/145' },
  { codigoApp: '8.1.9',  descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SOBRESOLO 03',                                                    codigoInformakon: '1382/146' },
  { codigoApp: '8.1.10', descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - LAZER',                                                           codigoInformakon: '1382/147' },
  { codigoApp: '8.1.11', descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - PANORAMICO',                                                      codigoInformakon: '1382/148' },
  { codigoApp: '8.1.12', descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - 1° PAVIMENTO ( TIPO )',                                           codigoInformakon: '1382/149' },
  { codigoApp: '8.1.13', descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - PAVIMENTO TIPO  ( 2° AO 36° PAV )',                               codigoInformakon: '1382/150' },
  { codigoApp: '8.1.14', descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - COBERTURA',                                                       codigoInformakon: '1382/151' },
  { codigoApp: '8.1.15', descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - ROOFTOP + MEZANINO',                                              codigoInformakon: '1382/152' },
  { codigoApp: '8.1.16', descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - CASA DE MAQUINA',                                                 codigoInformakon: '1382/153' },
  { codigoApp: '8.1.17', descricao: 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - HELIPONTO',                                                       codigoInformakon: '1382/154' },
  { codigoApp: '8.2.1',  descricao: 'INSTALAÇÃO DE BOMBAS - DRENAGEM - AGUAS PLUVIAIS - SUBSOLO 4 ( TUBOS, CONEXÕES E VALVULAS  )',         codigoInformakon: '1382/155' },

  // === Grupo 9 — Esgoto ===
  { codigoApp: '9.1.1',  descricao: 'TUBOS E CONEXÕES - ESGOTO - PRUMADA VERTICAL ( Dividida em vãos entre pavimentos )',                  codigoInformakon: '1382/156' },
  { codigoApp: '9.1.2',  descricao: 'TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 04',                                                             codigoInformakon: '1382/157' },
  { codigoApp: '9.1.3',  descricao: 'TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 03',                                                             codigoInformakon: '1382/158' },
  { codigoApp: '9.1.4',  descricao: 'TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 02',                                                             codigoInformakon: '1382/159' },
  { codigoApp: '9.1.5',  descricao: 'TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 01',                                                             codigoInformakon: '1382/160' },
  { codigoApp: '9.1.6',  descricao: 'TUBOS E CONEXÕES - ESGOTO  - TERREO',                                                                 codigoInformakon: '1382/161' },
  { codigoApp: '9.1.7',  descricao: 'TUBOS E CONEXÕES - ESGOTO  - SOBRESOLO 01',                                                           codigoInformakon: '1382/162' },
  { codigoApp: '9.1.8',  descricao: 'TUBOS E CONEXÕES - ESGOTO  - SOBRESOLO 02',                                                           codigoInformakon: '1382/163' },
  { codigoApp: '9.1.9',  descricao: 'TUBOS E CONEXÕES - ESGOTO  - SOBRESOLO 03',                                                           codigoInformakon: '1382/164' },
  { codigoApp: '9.1.10', descricao: 'TUBOS E CONEXÕES - ESGOTO  - LAZER',                                                                  codigoInformakon: '1382/165' },
  { codigoApp: '9.1.11', descricao: 'TUBOS E CONEXÕES - ESGOTO  - PANORAMICO',                                                             codigoInformakon: '1382/166' },
  { codigoApp: '9.1.12', descricao: 'TUBOS E CONEXÕES - ESGOTO  - 1° PAVIMENTO ( TIPO )',                                                  codigoInformakon: '1382/167' },
  { codigoApp: '9.1.13', descricao: 'TUBOS E CONEXÕES - ESGOTO  - PAVIMENTO TIPO  ( 2° AO 36° PAV )',                                      codigoInformakon: '1382/168' },
  { codigoApp: '9.1.14', descricao: 'TUBOS E CONEXÕES - ESGOTO  - COBERTURA',                                                              codigoInformakon: '1382/169' },
  { codigoApp: '9.1.15', descricao: 'TUBOS E CONEXÕES - ESGOTO  - ROOFTOP + MEZANINO',                                                     codigoInformakon: '1382/170' },
  { codigoApp: '9.1.16', descricao: 'TUBOS E CONEXÕES - ESGOTO  - CASA DE MAQUINA',                                                        codigoInformakon: '1382/171' },

  // === Grupo 10.1 — Hidráulica (mapeia em água fria) ===
  { codigoApp: '10.1.1',  descricao: 'TUBOS E CONEXÕES - HIDRÁULICA - PRUMADA VERTICAL ( Dividida em vãos )',                              codigoInformakon: '1382/172' },
  { codigoApp: '10.1.2',  descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 04',                                                        codigoInformakon: '1382/173' },
  { codigoApp: '10.1.3',  descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 03',                                                        codigoInformakon: '1382/174' },
  { codigoApp: '10.1.4',  descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 02',                                                        codigoInformakon: '1382/175' },
  { codigoApp: '10.1.5',  descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 01',                                                        codigoInformakon: '1382/176' },
  { codigoApp: '10.1.6',  descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - TERREO',                                                            codigoInformakon: '1382/177' },
  { codigoApp: '10.1.7',  descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - SOBRESOLO 01',                                                      codigoInformakon: null /* VERIFICAR */ },
  { codigoApp: '10.1.8',  descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - SOBRESOLO 02',                                                      codigoInformakon: '1382/178' },
  { codigoApp: '10.1.9',  descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - SOBRESOLO 03',                                                      codigoInformakon: '1382/179' },
  { codigoApp: '10.1.10', descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - LAZER',                                                             codigoInformakon: '1382/180' },
  { codigoApp: '10.1.11', descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - PANORAMICO',                                                        codigoInformakon: '1382/181' },
  { codigoApp: '10.1.12', descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - PAVIMENTO TIPO  ( 1° AO 36° PAV )',                                 codigoInformakon: '1382/182' },
  { codigoApp: '10.1.13', descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - COBERTURA',                                                         codigoInformakon: '1382/183' },
  { codigoApp: '10.1.14', descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - ROOFTOP + MEZANINO',                                                codigoInformakon: '1382/184' },
  { codigoApp: '10.1.15', descricao: 'TUBOS E CONEXÕES - HIDRÁULICA  - CASA DE MAQUINA',                                                   codigoInformakon: '1382/185' },

  // === Grupo 10.2 — Hidráulica água quente ===
  { codigoApp: '10.2.1', descricao: 'TUBOS E CONEXÕES - HIDRAULICA  - PAVIMENTO TIPO  ( 1° AO 36° PAV )',                                  codigoInformakon: '1382/186' },
  { codigoApp: '10.2.2', descricao: 'TUBOS E CONEXÕES - HIDRAULICA  - COBERTURA',                                                          codigoInformakon: '1382/187' },
  { codigoApp: '10.2.3', descricao: 'TUBOS E CONEXÕES - HIDRAULICA  - CASA DE MAQUINAS',                                                   codigoInformakon: '1382/188' },

  // === Grupo 10.3 — Hidrômetros e bombas ===
  { codigoApp: '10.3.1',  descricao: 'CONJUNTO HIDROMETROS APARTAMENTOS ( VALVULAS E CONEXÕES )',                                          codigoInformakon: '1382/189' },
  { codigoApp: '10.3.2',  descricao: 'CONJUNTO BOMBAS RECALQUE',                                                                            codigoInformakon: '1382/190' },
  { codigoApp: '10.3.3',  descricao: 'CONJUNTO BOMBAS PRESSURIZAÇÃO',                                                                       codigoInformakon: '1382/191' },
  { codigoApp: '10.3.4',  descricao: 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA F )',                                                  codigoInformakon: '1382/192' },
  { codigoApp: '10.3.5',  descricao: 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA G )',                                                  codigoInformakon: '1382/193' },
  { codigoApp: '10.3.6',  descricao: 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA CONDOMINIO )',                                         codigoInformakon: '1382/194' },
  { codigoApp: '10.3.7',  descricao: 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA B )',                                                  codigoInformakon: '1382/195' },
  { codigoApp: '10.3.8',  descricao: 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA C )',                                                  codigoInformakon: '1382/196' },
  { codigoApp: '10.3.9',  descricao: 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA D )',                                                  codigoInformakon: '1382/197' },
  { codigoApp: '10.3.10', descricao: 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA E )',                                                  codigoInformakon: '1382/198' },

  // === Grupo 12 — Piscina e SPA ===
  { codigoApp: '12.1.1', descricao: 'TUBOS E CONEXÕES ( PVC SOLDAVEL E PPR )',                                                              codigoInformakon: '1382/201' },
  { codigoApp: '12.1.1', descricao: 'ACABAMENTOS ( RALOS DE FUNDO, ASPIRAÇÃO E RETORNO )',                                                  codigoInformakon: '1382/199' },
  { codigoApp: '12.1.1', descricao: 'BARRILHETES E BOMBAS ( BOMBAS FILTROS E VALVULAS )',                                                   codigoInformakon: '1382/200' },

  // === Grupo 13 — Louças e metais ===
  { codigoApp: '13.1.1', descricao: 'LOUÇAS E METAIS - PAVIMENTO TERREO',                                                                  codigoInformakon: '1382/202' },
  { codigoApp: '13.1.2', descricao: 'LOUÇAS E METAIS - PAVIMENTO LAZER',                                                                   codigoInformakon: '1382/203' },
  { codigoApp: '13.1.3', descricao: 'LOUÇAS E METAIS - PAVIMENTO PANORAMICO',                                                              codigoInformakon: '1382/204' },
  { codigoApp: '13.1.4', descricao: 'LOUÇAS E METAIS - PAVIMENTO ROOFTOP + MEZANINO',                                                      codigoInformakon: '1382/205' },
  { codigoApp: '13.1.5', descricao: 'LOUÇAS E METAIS - PAVIMENTO CASA DE MAQ',                                                             codigoInformakon: '1382/206' },
  { codigoApp: '13.2.1', descricao: 'LOUÇAS E METAIS - PAVIMENTO TIPO 1 AO 36',                                                            codigoInformakon: '1382/207' },
  { codigoApp: '13.2.2', descricao: 'LOUÇAS E METAIS - COBERTURA',                                                                         codigoInformakon: '1382/208' },

  // === Grupo 14.1 — Hidrantes ===
  { codigoApp: '14.1.1', descricao: 'TUBOS E CONEXÕES - HIDRANTE - PRUMADA VERTICAL ( Dividida em vãos )',                                 codigoInformakon: '1382/212' },
  { codigoApp: '14.1.2', descricao: 'TUBOS E CONEXÕES - HIDRANTE - PAV TIPO ( 1 ao 36 )',                                                  codigoInformakon: '1382/213' },
  { codigoApp: '14.1.3', descricao: 'TUBOS E CONEXÕES - HIDRANTE - PAV COBERTURA',                                                         codigoInformakon: '1382/214' },
  { codigoApp: '14.1.4', descricao: 'TUBOS E CONEXÕES - HIDRANTE - PAV ROOFTOP + MEZANINO',                                                codigoInformakon: '1382/215' },
  { codigoApp: '14.1.5', descricao: 'TUBOS E CONEXÕES - HIDRANTE - PAV CASA DE MAQUINA',                                                   codigoInformakon: '1382/216' },
  { codigoApp: '14.1.6', descricao: 'CAIXAS E ACESSORIOS - HIDRANTE - SUBSOLO 4 A0 PAV TIPO 36',                                           codigoInformakon: '1382/209' },
  { codigoApp: '14.1.7', descricao: 'CAIXAS E ACESSORIOS - HIDRANTE - PAV COBERTURA',                                                      codigoInformakon: '1382/210' },
  { codigoApp: '14.1.8', descricao: 'CAIXAS E ACESSORIOS - HIDRANTE - PAV ROOFTOP + MEZANINO',                                             codigoInformakon: '1382/211' },

  // === Grupo 14.2 — Sprinklers ===
  { codigoApp: '14.2.1',  descricao: 'TUBOS E CONEXÕES - SPRINKLER - PRUMADA VERTICAL ( Dividida por  vãos entre pavimentos  )',           codigoInformakon: '1382/217' },
  { codigoApp: '14.2.2',  descricao: 'TUBOS E CONEXÕES - SPRINKLER - CONJUNTO VALVULA REDUTORA DE PRESSÃO',                                codigoInformakon: '1382/218' },
  { codigoApp: '14.2.3',  descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 4',                                                 codigoInformakon: '1382/219' },
  { codigoApp: '14.2.4',  descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 3',                                                 codigoInformakon: '1382/220' },
  { codigoApp: '14.2.5',  descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 2',                                                 codigoInformakon: '1382/221' },
  { codigoApp: '14.2.6',  descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 1',                                                 codigoInformakon: '1382/222' },
  { codigoApp: '14.2.7',  descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO TERREO',                                                    codigoInformakon: '1382/223' },
  { codigoApp: '14.2.8',  descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SOBRESOLO 1',                                               codigoInformakon: '1382/224' },
  { codigoApp: '14.2.9',  descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SOBRESOLO 2',                                               codigoInformakon: '1382/225' },
  { codigoApp: '14.2.10', descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SOBRESOLO 3',                                               codigoInformakon: '1382/226' },
  { codigoApp: '14.2.11', descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO LAZER',                                                     codigoInformakon: '1382/227' },
  { codigoApp: '14.2.12', descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO PANORAMICO',                                                codigoInformakon: '1382/228' },
  { codigoApp: '14.2.13', descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO TIPO ( 1° ao 36° )',                                        codigoInformakon: '1382/229' },
  { codigoApp: '14.2.14', descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO COBERTURA',                                                 codigoInformakon: '1382/230' },
  { codigoApp: '14.2.15', descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO ROOFTOP + MEZANINO',                                        codigoInformakon: '1382/231' },
  { codigoApp: '14.2.16', descricao: 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO CASA DE MAQUINA',                                           codigoInformakon: '1382/232' },
  { codigoApp: '14.3.1',  descricao: 'BARRILHETE BOMBAS - CASA DE MAQUINAS',                                                                codigoInformakon: '1382/233' },

  // === Grupo 15.1 (sinalização) — INSTALAÇÕES SINALIZAÇÃO mapeia em luminárias de emergência ===
  { codigoApp: '15.1.1',  descricao: 'INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 04 + SUBSOLO 05',                                                  codigoInformakon: '1382/234' },
  { codigoApp: '15.1.2',  descricao: 'INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 03',                                                               codigoInformakon: '1382/242' },
  { codigoApp: '15.1.3',  descricao: 'INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 02',                                                               codigoInformakon: '1382/243' },
  { codigoApp: '15.1.4',  descricao: 'INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 01',                                                               codigoInformakon: '1382/244' },
  { codigoApp: '15.1.5',  descricao: 'INSTALAÇÕES SINALIZAÇÃO - TERREO',                                                                   codigoInformakon: '1382/245' },
  { codigoApp: '15.1.6',  descricao: 'INSTALAÇÕES SINALIZAÇÃO - SOBRESOLO 01',                                                             codigoInformakon: '1382/246' },
  { codigoApp: '15.1.7',  descricao: 'INSTALAÇÕES SINALIZAÇÃO - SOBRESOLO 02',                                                             codigoInformakon: '1382/247' },
  { codigoApp: '15.1.8',  descricao: 'INSTALAÇÕES SINALIZAÇÃO - SOBRESOLO 03',                                                             codigoInformakon: '1382/236' },
  { codigoApp: '15.1.9',  descricao: 'INSTALAÇÕES SINALIZAÇÃO - LAZER',                                                                    codigoInformakon: '1382/237' },
  { codigoApp: '15.1.10', descricao: 'INSTALAÇÕES SINALIZAÇÃO - PANORAMICO',                                                               codigoInformakon: '1382/235' },
  { codigoApp: '15.1.11', descricao: 'INSTALAÇÕES SINALIZAÇÃO - PAV TIPO ( 1° AO 36 )',                                                    codigoInformakon: '1382/238' },
  { codigoApp: '15.1.12', descricao: 'INSTALAÇÕES SINALIZAÇÃO- PAV COBERTURA',                                                             codigoInformakon: '1382/239' },
  { codigoApp: '15.1.13', descricao: 'INSTALAÇÕES SINALIZAÇÃO- PAV ROOFTOP + MEZANINO ROOFTOP',                                            codigoInformakon: '1382/240' },
  { codigoApp: '15.1.14', descricao: 'INSTALAÇÕES SINALIZAÇÃO - PAV CASA DE MAQUINAS',                                                     codigoInformakon: '1382/241' },

  // === Grupo 15.1 (extintores) ===
  { codigoApp: '15.1.1',  descricao: 'INSTALAÇÕES EXTINTORES - SUBSOLO 04 + SUBSOLO 05',                                                   codigoInformakon: '1382/248' },
  { codigoApp: '15.1.2',  descricao: 'INSTALAÇÕES EXTINTORES - SUBSOLO 03',                                                                codigoInformakon: '1382/249' },
  { codigoApp: '15.1.3',  descricao: 'INSTALAÇÕES EXTINTORES - SUBSOLO 02',                                                                codigoInformakon: '1382/262' },
  { codigoApp: '15.1.4',  descricao: 'INSTALAÇÕES EXTINTORES - SUBSOLO 01',                                                                codigoInformakon: '1382/252' },
  { codigoApp: '15.1.5',  descricao: 'INSTALAÇÕES EXTINTORES - TERREO',                                                                    codigoInformakon: '1382/253' },
  { codigoApp: '15.1.6',  descricao: 'INSTALAÇÕES EXTINTORES - SOBRESOLO 01',                                                              codigoInformakon: '1382/254' },
  { codigoApp: '15.1.7',  descricao: 'INSTALAÇÕES EXTINTORES - SOBRESOLO 02',                                                              codigoInformakon: '1382/255' },
  { codigoApp: '15.1.8',  descricao: 'INSTALAÇÕES EXTINTORES - SOBRESOLO 03',                                                              codigoInformakon: '1382/256' },
  { codigoApp: '15.1.9',  descricao: 'INSTALAÇÕES EXTINTORES - LAZER',                                                                     codigoInformakon: '1382/250' },
  { codigoApp: '15.1.10', descricao: 'INSTALAÇÕES EXTINTORES - PANORAMICO',                                                                codigoInformakon: '1382/251' },
  { codigoApp: '15.1.11', descricao: 'INSTALAÇÕES EXTINTORES - PAV TIPO ( 1° AO 36 )',                                                     codigoInformakon: '1382/257' },
  { codigoApp: '15.1.12', descricao: 'INSTALAÇÕES EXTINTORES- PAV COBERTURA',                                                              codigoInformakon: '1382/258' },
  { codigoApp: '15.1.13', descricao: 'INSTALAÇÕES EXTINTORES- PAV ROOFTOP + MEZANINO ROOFTOP',                                             codigoInformakon: '1382/259' },
  { codigoApp: '15.1.14', descricao: 'INSTALAÇÕES EXTINTORES - PAV CASA DE MAQUINAS',                                                      codigoInformakon: '1382/260' },
  { codigoApp: '15.1.15', descricao: 'INSTALAÇÕES EXTINTORES - HELIPONTO',                                                                 codigoInformakon: '1382/261' },

  // === Grupo 16.1 — Infra SDAI ===
  { codigoApp: '16.1.1',  descricao: 'INFRA SDAI - SUBSOLO 04',                                                                            codigoInformakon: '1382/263' },
  { codigoApp: '16.1.2',  descricao: 'INFRA SDAI - SUBSOLO 03',                                                                            codigoInformakon: '1382/264' },
  { codigoApp: '16.1.3',  descricao: 'INFRA SDAI - SUBSOLO 02',                                                                            codigoInformakon: '1382/265' },
  { codigoApp: '16.1.4',  descricao: 'INFRA SDAI - SUBSOLO 01',                                                                            codigoInformakon: '1382/266' },
  { codigoApp: '16.1.5',  descricao: 'INFRA SDAI - TERREO',                                                                                codigoInformakon: '1382/267' },
  { codigoApp: '16.1.6',  descricao: 'INFRA SDAI - SOBRESOLO 01',                                                                          codigoInformakon: '1382/268' },
  { codigoApp: '16.1.7',  descricao: 'INFRA SDAI - SOBRESOLO 02',                                                                          codigoInformakon: '1382/269' },
  { codigoApp: '16.1.8',  descricao: 'INFRA SDAI - SOBRESOLO 03',                                                                          codigoInformakon: '1382/270' },
  { codigoApp: '16.1.9',  descricao: 'INFRA SDAI - LAZER',                                                                                 codigoInformakon: '1382/271' },
  { codigoApp: '16.1.10', descricao: 'INFRA SDAI - PANORAMICO',                                                                            codigoInformakon: '1382/272' },
  { codigoApp: '16.1.11', descricao: 'INFRA SDAI - PAV TIPO ( 1° AO 36 )',                                                                 codigoInformakon: '1382/273' },
  { codigoApp: '16.1.12', descricao: 'INFRA  SDAI - PAV COBERTURA',                                                                        codigoInformakon: '1382/274' },
  { codigoApp: '16.1.13', descricao: 'INFRA SDAI - PAV ROOFTOP + MEZANINO ROOFTOP',                                                        codigoInformakon: '1382/275' },
  { codigoApp: '16.1.14', descricao: 'INFRA SDAI - PAV CASA DE MAQUINAS',                                                                  codigoInformakon: '1382/276' },
  { codigoApp: '16.1.15', descricao: 'INFRA SDAI - INFRA VERTICAL ( DIVIDIDO POR VÃOS )',                                                  codigoInformakon: '1382/277' },

  // === Grupo 16.2 (cabeamento SDAI) ===
  { codigoApp: '16.2.1',  descricao: 'CABEAMENTO SDAI - SUBSOLO 04',                                                                       codigoInformakon: '1382/291' },
  { codigoApp: '16.2.2',  descricao: 'CABEAMENTO SDAI - SUBSOLO 03',                                                                       codigoInformakon: '1382/292' },
  { codigoApp: '16.2.3',  descricao: 'CABEAMENTO SDAI - SUBSOLO 02',                                                                       codigoInformakon: '1382/289' },
  { codigoApp: '16.2.4',  descricao: 'CABEAMENTO SDAI - SUBSOLO 01',                                                                       codigoInformakon: '1382/290' },
  { codigoApp: '16.2.5',  descricao: 'CABEAMENTO SDAI - TERREO',                                                                           codigoInformakon: '1382/278' },
  { codigoApp: '16.2.6',  descricao: 'CABEAMENTO SDAI - SOBRESOLO 01',                                                                     codigoInformakon: '1382/279' },
  { codigoApp: '16.2.7',  descricao: 'CABEAMENTO SDAI - SOBRESOLO 02',                                                                     codigoInformakon: '1382/280' },
  { codigoApp: '16.2.8',  descricao: 'CABEAMENTO SDAI - SOBRESOLO 03',                                                                     codigoInformakon: '1382/281' },
  { codigoApp: '16.2.9',  descricao: 'CABEAMENTO SDAI - LAZER',                                                                            codigoInformakon: '1382/282' },
  { codigoApp: '16.2.10', descricao: 'CABEAMENTO SDAI - PANORAMICO',                                                                       codigoInformakon: '1382/283' },
  { codigoApp: '16.2.11', descricao: 'CABEAMENTO SDAI - PAV TIPO ( 1° AO 36 )',                                                            codigoInformakon: '1382/284' },
  { codigoApp: '16.2.12', descricao: 'CABEAMENTO  SDAI - PAV COBERTURA',                                                                   codigoInformakon: '1382/285' },
  { codigoApp: '16.2.13', descricao: 'CABEAMENTO SDAI - PAV ROOFTOP + MEZANINO ROOFTOP',                                                   codigoInformakon: '1382/286' },
  { codigoApp: '16.2.14', descricao: 'CABEAMENTO SDAI - PAV CASA DE MAQUINAS',                                                             codigoInformakon: '1382/287' },
  { codigoApp: '16.2.15', descricao: 'CABEAMENTO SDAI - INFRA VERTICAL ( DIVIDIDO POR VÃOS )',                                             codigoInformakon: '1382/288' },

  // === Grupo 16.2 (equipamentos SDAI) ===
  { codigoApp: '16.2.1',  descricao: 'EQUIPAMENTOS SDAI - SUBSOLO 04',                                                                     codigoInformakon: '1382/303' },
  { codigoApp: '16.2.2',  descricao: 'EQUIPAMENTOS SDAI - SUBSOLO 03',                                                                     codigoInformakon: '1382/304' },
  { codigoApp: '16.2.3',  descricao: 'EQUIPAMENTOS SDAI - SUBSOLO 02',                                                                     codigoInformakon: '1382/305' },
  { codigoApp: '16.2.4',  descricao: 'EQUIPAMENTOS SDAI - SUBSOLO 01',                                                                     codigoInformakon: '1382/306' },
  { codigoApp: '16.2.5',  descricao: 'EQUIPAMENTOS SDAI - TERREO',                                                                         codigoInformakon: '1382/293' },
  { codigoApp: '16.2.6',  descricao: 'EQUIPAMENTOS SDAI - SOBRESOLO 01',                                                                   codigoInformakon: '1382/294' },
  { codigoApp: '16.2.7',  descricao: 'EQUIPAMENTOS SDAI - SOBRESOLO 02',                                                                   codigoInformakon: '1382/295' },
  { codigoApp: '16.2.8',  descricao: 'EQUIPAMENTOS SDAI - SOBRESOLO 03',                                                                   codigoInformakon: '1382/296' },
  { codigoApp: '16.2.9',  descricao: 'EQUIPAMENTOS SDAI - LAZER',                                                                          codigoInformakon: '1382/297' },
  { codigoApp: '16.2.10', descricao: 'EQUIPAMENTOS SDAI - PANORAMICO',                                                                     codigoInformakon: '1382/298' },
  { codigoApp: '16.2.11', descricao: 'EQUIPAMENTOS SDAI - PAV TIPO ( 1° AO 36 )',                                                          codigoInformakon: '1382/299' },
  { codigoApp: '16.2.12', descricao: 'EQUIPAMENTOS  SDAI - PAV COBERTURA',                                                                 codigoInformakon: '1382/300' },
  { codigoApp: '16.2.13', descricao: 'EQUIPAMENTOS SDAI - PAV ROOFTOP + MEZANINO ROOFTOP',                                                 codigoInformakon: '1382/301' },
  { codigoApp: '16.2.14', descricao: 'EQUIPAMENTOS SDAI - PAV CASA DE MAQUINAS',                                                           codigoInformakon: '1382/302' },

  // === Grupo 17.1 (tubos gás) ===
  { codigoApp: '17.1.1', descricao: 'TUBOS E CONEXÕES - GÁS - INFRA VERTICAL ( DIVIDIDO POR VÃOS ENTRE PAVIMENTOS )',                      codigoInformakon: '1382/313' },
  { codigoApp: '17.1.2', descricao: 'TUBOS E CONEXÕES - GÁS - TERREO',                                                                     codigoInformakon: '1382/307' },
  { codigoApp: '17.1.3', descricao: 'TUBOS E CONEXÕES - GÁS - LAZER',                                                                      codigoInformakon: '1382/308' },
  { codigoApp: '17.1.4', descricao: 'TUBOS E CONEXÕES - GÁS - PANORAMICO',                                                                 codigoInformakon: '1382/309' },
  { codigoApp: '17.1.5', descricao: 'TUBOS E CONEXÕES - GÁS - PAV TIPO ( 1° AO 36 )',                                                      codigoInformakon: '1382/311' },
  { codigoApp: '17.1.6', descricao: 'TUBOS E CONEXÕES  - GÁS - PAV COBERTURA',                                                             codigoInformakon: '1382/310' },
  { codigoApp: '17.1.7', descricao: 'TUBOS E CONEXÕES - GÁS - PAV ROOFTOP + MEZANINO ROOFTOP',                                             codigoInformakon: '1382/312' },

  // === Grupo 17.1 (equipamentos gás) ===
  { codigoApp: '17.1.1', descricao: 'EQUIPAMENTOS GÁS - LAZER',                                                                            codigoInformakon: '1382/314' },
  { codigoApp: '17.1.2', descricao: 'EQUIPAMENTOS GÁS - PANORAMICO',                                                                       codigoInformakon: '1382/315' },
  { codigoApp: '17.1.3', descricao: 'EQUIPAMENTOS GÁS - PAV TIPO ( 1° AO 36 )',                                                            codigoInformakon: '1382/316' },
  { codigoApp: '17.1.4', descricao: 'EQUIPAMENTOS  GÁS - PAV COBERTURA',                                                                   codigoInformakon: '1382/317' },
  { codigoApp: '17.1.5', descricao: 'EQUIPAMENTOS GÁS - PAV ROOFTOP + MEZANINO ROOFTOP',                                                   codigoInformakon: '1382/318' },

  // === Grupo 18 — SPDA ===
  { codigoApp: '18.1.1',  descricao: 'ATERRAMENTO  - SPDA -  SUBSOLO 4',                                                                   codigoInformakon: '1382/331' },
  { codigoApp: '18.1.2',  descricao: 'ANEL INTERMEDIARIO  - SPDA -  LAZER',                                                                codigoInformakon: '1382/319' },
  { codigoApp: '18.1.3',  descricao: 'ANEL INTERMEDIARIO  - SPDA -  2o PAV',                                                               codigoInformakon: '1382/320' },
  { codigoApp: '18.1.4',  descricao: 'ANEL INTERMEDIARIO  - SPDA -  6o PAV',                                                               codigoInformakon: '1382/321' },
  { codigoApp: '18.1.5',  descricao: 'ANEL INTERMEDIARIO  - SPDA -  10o PAV',                                                              codigoInformakon: '1382/322' },
  { codigoApp: '18.1.6',  descricao: 'ANEL INTERMEDIARIO  - SPDA -  14o PAV',                                                              codigoInformakon: '1382/323' },
  { codigoApp: '18.1.7',  descricao: 'ANEL INTERMEDIARIO  - SPDA -  18o PAV',                                                              codigoInformakon: '1382/324' },
  { codigoApp: '18.1.8',  descricao: 'ANEL INTERMEDIARIO  - SPDA -  22o PAV',                                                              codigoInformakon: '1382/325' },
  { codigoApp: '18.1.9',  descricao: 'ANEL INTERMEDIARIO  - SPDA -  26o PAV',                                                              codigoInformakon: '1382/326' },
  { codigoApp: '18.1.10', descricao: 'ANEL INTERMEDIARIO  - SPDA -  30o PAV',                                                              codigoInformakon: '1382/327' },
  { codigoApp: '18.1.11', descricao: 'ANEL INTERMEDIARIO  - SPDA -  34o PAV',                                                              codigoInformakon: '1382/328' },
  { codigoApp: '18.1.12', descricao: 'ANEL INTERMEDIARIO  - SPDA -  COBERTURA',                                                            codigoInformakon: '1382/329' },
  { codigoApp: '18.1.13', descricao: 'ANEL COBERTA - SPDA -  HELIPONTO',                                                                   codigoInformakon: '1382/330' },
  { codigoApp: '18.1.14', descricao: 'SUBIDAS VERTICAIS ( DIVIDIDA POR VÃOS )',                                                            codigoInformakon: '1382/332' },

  // === Grupo 19 — Serviços complementares ===
  { codigoApp: '19.1.1', descricao: 'ADMINISTRAÇÃO OBRA ( MÊS )',                                                                          codigoInformakon: '1382/333' },
  { codigoApp: '19.1.2', descricao: 'FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS',                                                           codigoInformakon: '1382/334' },
]

// ============================================================
// Lookup
// ============================================================

/** Fingerprint robusto: NFD + remove acentos + lowercase + só alfanumérico. */
function fingerprint(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const FP_MAP = new Map<string, string>()
for (const m of MAPEAMENTO) {
  if (m.codigoInformakon) FP_MAP.set(fingerprint(m.descricao), m.codigoInformakon)
}

/**
 * Resolve o código CT/Serv Informakon (ex.: "1382/5") a partir da
 * descrição do detalhamento. Retorna `null` quando o item não tem
 * mapeamento definido (ex.: 10.1.7 que ainda está pendente).
 */
export function getCodigoInformakon(descricao: string | null | undefined): string | null {
  if (!descricao) return null
  return FP_MAP.get(fingerprint(descricao)) ?? null
}
