// Mapeamento estático de códigos Informakon (CT/Serv) ← descrição do item.
// Fonte: lista CT/Serv 1382/* fornecida pra contrato WAVE-2025-001.
// O lookup é por descrição normalizada (case-insensitive, sem prefixo
// "Serviço de execução de"/"Serviço de", whitespace colapsado),
// com fallback de prefixo pra entradas Informakon truncadas (ex.: 1382/4).

interface InformakonEntry {
  codigo: string
  descricao: string
}

const ENTRADAS: InformakonEntry[] = [
  { codigo: '1382/1',   descricao: 'Serviço de execução de entrada de energia - infraestrutura ( poste ao pmt )' },
  { codigo: '1382/2',   descricao: 'Serviço de execução de entrada de energia - cabeamento média ( poste ao pmt  )' },
  { codigo: '1382/3',   descricao: 'Serviço de execução de entrada de energia - equipamentos( painel de média tensão  )' },
  { codigo: '1382/4',   descricao: 'Serviço de execução de entrada / se pmuc / se grupo a  - aterramento ( haste + cabeamento + fechamen' },
  { codigo: '1382/5',   descricao: 'Serviço de execução de subestação pmuc - infraestrutura ( pmt até subestação pmuc + trafo ao cpg)' },
  { codigo: '1382/6',   descricao: 'Serviço de execução de subestação pmuc - cabeamento média ( pmt até subestação pmuc )' },
  { codigo: '1382/7',   descricao: 'Serviço de execução de subestação pmuc - equipamento ( tranformadores e fechamentos )' },
  { codigo: '1382/8',   descricao: "Serviço de execução de subestação pmuc - cabeamento baixa tensão ( transformadores aos cpg's )" },
  { codigo: '1382/9',   descricao: "Serviço de execução de subestação pmuc - quadros ( cpg's )" },
  { codigo: '1382/10',  descricao: 'Serviço de execução de subestação grupo a  - infraestrutura ( pmt até subestação grupo a  )' },
  { codigo: '1382/11',  descricao: 'Serviço de execução de subestação grupo a  - cabeamento média ( pmt até subestação grupo a  )' },
  { codigo: '1382/12',  descricao: 'Serviço de execução de subestação grupo a  - equipamento ( tranformador e fechamentos )' },
  { codigo: '1382/13',  descricao: "Serviço de execução de subestação grupo a  - cabeamento baixa tensão ( transformadores aos cpg')" },
  { codigo: '1382/14',  descricao: 'Serviço de execução de subestação grupo a  - quadros ( cpg )' },
  { codigo: '1382/15',  descricao: 'Serviço de execução de  grupo gerador pmuc  - equipamento ( gerador 500 kva + escapamento )' },
  { codigo: '1382/16',  descricao: "Serviço de execução de  grupo gerador pmuc  - paineis (  qta's + quadros reversão )" },
  { codigo: '1382/17',  descricao: 'Serviço de execução de  grupo gerador pmuc  - infraestrutura  (  eletrodutos )' },
  { codigo: '1382/18',  descricao: 'Serviço de execução de  grupo gerador pmuc  - cabeamento baixa tensão + comando' },
  { codigo: '1382/19',  descricao: 'Serviço de execução de  grupo gerador condominio  - equipamento ( gerador 500 kva + escapamento )' },
  { codigo: '1382/20',  descricao: 'Serviço de execução de  grupo gerador condominio  - paineis (  qta emerg + qta qdc + qdg gerador )' },
  { codigo: '1382/21',  descricao: 'Serviço de execução de  grupo gerador condominio  - infraestrutura  (  eletrodutos )' },
  { codigo: '1382/22',  descricao: 'Serviço de execução de  grupo gerador condominio  - cabeamento baixa tensão + comando' },
  { codigo: '1382/23',  descricao: 'Serviço de execução de  grupo gerador pmuc + condominio  - aterramento' },
  { codigo: '1382/24',  descricao: 'Serviço de execução de  cabeamento alimentação elétrica - terreo' },
  { codigo: '1382/25',  descricao: 'Serviço de execução de  cabeamento alimentação elétrica - sobressolo 01' },
  { codigo: '1382/26',  descricao: 'Serviço de execução de  cabeamento alimentação elétrica - sobressolo 02' },
  { codigo: '1382/27',  descricao: 'Serviço de execução de  cabeamento alimentação elétrica - sobressolo 03' },
  { codigo: '1382/28',  descricao: 'Serviço de execução de  cabeamento alimentação elétrica - lazer' },
  { codigo: '1382/29',  descricao: 'Serviço de execução de  cabeamento alimentação elétrica - panoramico' },
  { codigo: '1382/30',  descricao: 'Serviço de execução de  cabeamento alimentação elétrica - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/31',  descricao: 'Serviço de execução de  cabeamento alimentação elétrica - pav cobertura' },
  { codigo: '1382/32',  descricao: 'Serviço de execução de  cabeamento alimentação elétrica - pav rooftop + mezanino rooftop' },
  { codigo: '1382/33',  descricao: 'Serviço de execução de  cabeamento alimentação elétrica - pav casa de maquinas' },
  { codigo: '1382/34',  descricao: 'Serviço de execução de  infra alimentação elétrica - subsolo 04' },
  { codigo: '1382/35',  descricao: 'Serviço de execução de  infra alimentação elétrica - subsolo 03' },
  { codigo: '1382/36',  descricao: 'Serviço de execução de  infra alimentação elétrica - subsolo 02' },
  { codigo: '1382/37',  descricao: 'Serviço de execução de  infra alimentação elétrica - subsolo 01' },
  { codigo: '1382/38',  descricao: 'Serviço de execução de  infra alimentação elétrica - terreo' },
  { codigo: '1382/39',  descricao: 'Serviço de execução de  infra alimentação elétrica - sobressolo 01' },
  { codigo: '1382/40',  descricao: 'Serviço de execução de  infra alimentação elétrica - sobressolo 02' },
  { codigo: '1382/41',  descricao: 'Serviço de execução de  infra alimentação elétrica - sobressolo 03' },
  { codigo: '1382/42',  descricao: 'Serviço de execução de  infra alimentação elétrica - lazer' },
  { codigo: '1382/43',  descricao: 'Serviço de execução de  infra alimentação elétrica - panoramico' },
  { codigo: '1382/44',  descricao: 'Serviço de execução de  infra alimentação elétrica - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/45',  descricao: 'Serviço de execução de  infra alimentação elétrica - pav cobertura' },
  { codigo: '1382/46',  descricao: 'Serviço de execução de  infra alimentação elétrica - pav rooftop + mezanino rooftop' },
  { codigo: '1382/47',  descricao: 'Serviço de execução de  infra alimentação elétrica - pav casa de maquinas' },
  { codigo: '1382/48',  descricao: 'Serviço de execução de  infra alimentação elétrica - infra vertical ( dividido por vãos entre pavime' },
  { codigo: '1382/49',  descricao: 'Serviço de execução de cabeamento alimentação elétrica - subsolo 04' },
  { codigo: '1382/50',  descricao: 'Serviço de execução de cabeamento alimentação elétrica - subsolo 03' },
  { codigo: '1382/51',  descricao: 'Serviço de execução de cabeamento alimentação elétrica - subsolo 02' },
  { codigo: '1382/52',  descricao: 'Serviço de execução de cabeamento alimentação elétrica - subsolo 01' },
  { codigo: '1382/53',  descricao: 'Serviço de execução de  infra distribuição elétrica - subsolo 04 + subsolo 05' },
  { codigo: '1382/54',  descricao: 'Serviço de execução de  infra distribuição elétrica - subsolo 03' },
  { codigo: '1382/55',  descricao: 'Serviço de execução de  infra distribuição elétrica - subsolo 02' },
  { codigo: '1382/56',  descricao: 'Serviço de execução de  infra distribuição elétrica - subsolo 01' },
  { codigo: '1382/57',  descricao: 'Serviço de execução de  infra distribuição elétrica - terreo' },
  { codigo: '1382/58',  descricao: 'Serviço de execução de  infra distribuição elétrica - sobressolo 01' },
  { codigo: '1382/59',  descricao: 'Serviço de execução de  infra distribuição elétrica - sobressolo 02' },
  { codigo: '1382/60',  descricao: 'Serviço de execução de  infra distribuição elétrica - sobressolo 03' },
  { codigo: '1382/61',  descricao: 'Serviço de execução de  infra distribuição elétrica - lazer' },
  { codigo: '1382/62',  descricao: 'Serviço de execução de  infra distribuição elétrica - panoramico' },
  { codigo: '1382/63',  descricao: 'Serviço de execução de  infra distribuição elétrica - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/64',  descricao: 'Serviço de execução de  infra distribuição elétrica - pav cobertura' },
  { codigo: '1382/65',  descricao: 'Serviço de execução de  infra distribuição elétrica - pav rooftop + mezanino rooftop' },
  { codigo: '1382/66',  descricao: 'Serviço de execução de  infra distribuição elétrica - pav casa de maquinas' },
  { codigo: '1382/67',  descricao: 'Serviço de execução de  infra distribuição elétrica - heliponto' },
  { codigo: '1382/68',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - subsolo 04 + subsolo 05' },
  { codigo: '1382/69',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - subsolo 03' },
  { codigo: '1382/70',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - subsolo 02' },
  { codigo: '1382/71',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - subsolo 01' },
  { codigo: '1382/72',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - terreo' },
  { codigo: '1382/73',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - sobressolo 01' },
  { codigo: '1382/74',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - sobressolo 02' },
  { codigo: '1382/75',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - sobressolo 03' },
  { codigo: '1382/76',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - lazer' },
  { codigo: '1382/77',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - panoramico' },
  { codigo: '1382/78',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/79',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - pav cobertura' },
  { codigo: '1382/80',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - pav rooftop + mezanino rooftop' },
  { codigo: '1382/81',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - pav casa de maquinas' },
  { codigo: '1382/82',  descricao: 'Serviço de execução de  cabeamento distribuição elétrica - heliponto' },
  { codigo: '1382/83',  descricao: 'Serviço de execução de tomadas e interruptores - subsolo 04 + subsolo 05' },
  { codigo: '1382/84',  descricao: 'Serviço de execução de tomadas e interruptores - subsolo 03' },
  { codigo: '1382/85',  descricao: 'Serviço de execução de tomadas e interruptores - subsolo 02' },
  { codigo: '1382/86',  descricao: 'Serviço de execução de tomadas e interruptores - subsolo 01' },
  { codigo: '1382/87',  descricao: 'Serviço de execução de tomadas e interruptores - terreo' },
  { codigo: '1382/88',  descricao: 'Serviço de execução de tomadas e interruptores - sobressolo 01' },
  { codigo: '1382/89',  descricao: 'Serviço de execução de tomadas e interruptores - sobressolo 02' },
  { codigo: '1382/90',  descricao: 'Serviço de execução de tomadas e interruptores - sobressolo 03' },
  { codigo: '1382/91',  descricao: 'Serviço de execução de tomadas e interruptores - lazer' },
  { codigo: '1382/92',  descricao: 'Serviço de execução de tomadas e interruptores - panoramico' },
  { codigo: '1382/93',  descricao: 'Serviço de execução de tomadas e interruptores - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/94',  descricao: 'Serviço de execução de tomadas e interruptores - pav cobertura' },
  { codigo: '1382/95',  descricao: 'Serviço de execução de tomadas e interruptores - pav rooftop + mezanino rooftop' },
  { codigo: '1382/96',  descricao: 'Serviço de execução de tomadas e interruptores - pav casa de maquinas' },
  { codigo: '1382/97',  descricao: 'Serviço de execução de  instalações luminárias - subsolo 04 + subsolo 05' },
  { codigo: '1382/98',  descricao: 'Serviço de execução de  instalações luminárias - panoramico' },
  { codigo: '1382/99',  descricao: 'Serviço de execução de instalações luminárias - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/100', descricao: 'Serviço de execução de instalações luminárias- pav cobertura' },
  { codigo: '1382/101', descricao: 'Serviço de execução de instalações luminárias- pav rooftop + mezanino rooftop' },
  { codigo: '1382/102', descricao: 'Serviço de execução de instalações luminárias - pav casa de maquinas' },
  { codigo: '1382/103', descricao: 'Serviço de execução de instalações luminárias - heliponto' },
  { codigo: '1382/104', descricao: 'Serviço de execução de instalações luminárias - subsolo 03' },
  { codigo: '1382/105', descricao: 'Serviço de execução de instalações luminárias - subsolo 02' },
  { codigo: '1382/106', descricao: 'Serviço de execução de instalações luminárias - subsolo 01' },
  { codigo: '1382/107', descricao: 'Serviço de execução de instalações luminárias - terreo' },
  { codigo: '1382/108', descricao: 'Serviço de execução de instalações luminárias - sobressolo 01' },
  { codigo: '1382/109', descricao: 'Serviço de execução de instalações luminárias - sobressolo 02' },
  { codigo: '1382/110', descricao: 'Serviço de execução de instalações luminárias - sobressolo 03' },
  { codigo: '1382/111', descricao: 'Serviço de execução de instalações luminárias - lazer' },
  { codigo: '1382/112', descricao: 'Serviço de execução de ql tipo (36 vezes)' },
  { codigo: '1382/113', descricao: 'Serviço de execução de quadros - cobertura (ql cobert - qb superior)' },
  { codigo: '1382/114', descricao: 'Serviço de execução de quadros mezanino (ql rooft - qfac rootf - ql pav 2)' },
  { codigo: '1382/115', descricao: 'Serviço de execução de quadros casa maquinas (ql rooft - qfac rootf - ql pav 2)' },
  { codigo: '1382/116', descricao: 'Serviço de execução de quadros - subsolo 04 + subsolo 05 (ql 4 sub - qf ex  4 sub - qb dren - qb irr' },
  { codigo: '1382/117', descricao: 'Serviço de execução de quadros - subsolo 03 (ql 3 sub - qf ex  3 sub)' },
  { codigo: '1382/118', descricao: 'Serviço de execução de quadros - subsolo 02 (ql 2 sub - qf ex  2 sub)' },
  { codigo: '1382/119', descricao: 'Serviço de execução de quadros - subsolo 01 (ql 1 sub - qf ex  1 sub - qb espelho)' },
  { codigo: '1382/120', descricao: 'Serviço de execução de quadros -terreo (cm - ql gua - ql ter - qd emg - qb press esc e qb rec sec)' },
  { codigo: '1382/121', descricao: 'Serviço de execução de quadros - sobressolo 01 (ql 1 sobr)' },
  { codigo: '1382/122', descricao: 'Serviço de execução de quadros - sobressolo 02 (ql 2 sobr e qdc)' },
  { codigo: '1382/123', descricao: 'Serviço de execução de quadros - sobressolo 03 (ql 3 sobr e qb pisc)' },
  { codigo: '1382/124', descricao: 'Serviço de execução de quadros - lazer (ql 3 sobr e qb pisc)' },
  { codigo: '1382/125', descricao: 'Serviço de execução de quadros - panoramico (ql pan - ql fac - qeude)' },
  { codigo: '1382/126', descricao: 'Serviço de execução de   infra dados  - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/127', descricao: 'Serviço de execução de   infra dados  - pav cobertura' },
  { codigo: '1382/128', descricao: 'Serviço de execução de  infra dados  - pav rooftop + mezanino rooftop' },
  { codigo: '1382/129', descricao: 'Serviço de execução de  infra dados - subsolo 04' },
  { codigo: '1382/130', descricao: 'Serviço de execução de  infra dados - subsolo 03' },
  { codigo: '1382/131', descricao: 'Serviço de execução de  infra dados - subsolo 02' },
  { codigo: '1382/132', descricao: 'Serviço de execução de  infra dados - subsolo 01' },
  { codigo: '1382/133', descricao: 'Serviço de execução de  infra dados  - terreo' },
  { codigo: '1382/134', descricao: 'Serviço de execução de  infra dados  - sobressolo 01' },
  { codigo: '1382/135', descricao: 'Serviço de execução de  infra dados  - sobressolo 02' },
  { codigo: '1382/136', descricao: 'Serviço de execução de  infra dados  - sobressolo 03' },
  { codigo: '1382/137', descricao: 'Serviço de execução de  infra dados  - lazer' },
  { codigo: '1382/138', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - prumada vertical ( dividida em vãos - 48' },
  { codigo: '1382/139', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - subsolo 04' },
  { codigo: '1382/140', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - subsolo 03' },
  { codigo: '1382/141', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - subsolo 02' },
  { codigo: '1382/142', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - subsolo 01' },
  { codigo: '1382/143', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - terreo' },
  { codigo: '1382/144', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - sobressolo 01' },
  { codigo: '1382/145', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - sobressolo 02' },
  { codigo: '1382/146', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - sobressolo 03' },
  { codigo: '1382/147', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - lazer' },
  { codigo: '1382/148', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - panoramico' },
  { codigo: '1382/149', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - 1° pavimento ( tipo )' },
  { codigo: '1382/150', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - pavimento tipo  ( 2° ao 36° pav )' },
  { codigo: '1382/151', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - cobertura' },
  { codigo: '1382/152', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - rooftop + mezanino' },
  { codigo: '1382/153', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - casa de maquina' },
  { codigo: '1382/154', descricao: 'Serviço de execução de tubos e conexões - aguas pluviais - heliponto' },
  { codigo: '1382/155', descricao: 'Serviço de execução de instalação de bombas - drenagem - aguas pluviais - subsolo 4 ( tubos, conexõe' },
  { codigo: '1382/156', descricao: 'Serviço de execução de tubos e conexões - esgoto - prumada vertical ( dividida em vãos entre pavimen' },
  { codigo: '1382/157', descricao: 'Serviço de execução de tubos e conexões - esgoto  - subsolo 04' },
  { codigo: '1382/158', descricao: 'Serviço de execução de tubos e conexões - esgoto  - subsolo 03' },
  { codigo: '1382/159', descricao: 'Serviço de execução de tubos e conexões - esgoto  - subsolo 02' },
  { codigo: '1382/160', descricao: 'Serviço de execução de tubos e conexões - esgoto  - subsolo 01' },
  { codigo: '1382/161', descricao: 'Serviço de execução de tubos e conexões - esgoto  - terreo' },
  { codigo: '1382/162', descricao: 'Serviço de execução de tubos e conexões - esgoto  - sobressolo 01' },
  { codigo: '1382/163', descricao: 'Serviço de execução de tubos e conexões - esgoto  - sobressolo 02' },
  { codigo: '1382/164', descricao: 'Serviço de execução de tubos e conexões - esgoto  - sobressolo 03' },
  { codigo: '1382/165', descricao: 'Serviço de execução de tubos e conexões - esgoto  - lazer' },
  { codigo: '1382/166', descricao: 'Serviço de execução de tubos e conexões - esgoto  - panoramico' },
  { codigo: '1382/167', descricao: 'Serviço de execução de tubos e conexões - esgoto  - 1° pavimento ( tipo )' },
  { codigo: '1382/168', descricao: 'Serviço de execução de tubos e conexões - esgoto  - pavimento tipo  ( 2° ao 36° pav )' },
  { codigo: '1382/169', descricao: 'Serviço de execução de tubos e conexões - esgoto  - cobertura' },
  { codigo: '1382/170', descricao: 'Serviço de execução de tubos e conexões - esgoto  - rooftop + mezanino' },
  { codigo: '1382/171', descricao: 'Serviço de execução de tubos e conexões - esgoto  - casa de maquina' },
  { codigo: '1382/172', descricao: 'Serviço de execução de tubos e conexões - água fria - prumada vertical ( dividida em vãos )' },
  { codigo: '1382/173', descricao: 'Serviço de execução de tubos e conexões - água fria  - subsolo 04' },
  { codigo: '1382/174', descricao: 'Serviço de execução de tubos e conexões - água fria  - subsolo 03' },
  { codigo: '1382/175', descricao: 'Serviço de execução de tubos e conexões - água fria  - subsolo 02' },
  { codigo: '1382/176', descricao: 'Serviço de execução de tubos e conexões - água fria  - subsolo 01' },
  { codigo: '1382/177', descricao: 'Serviço de execução de tubos e conexões - água fria  - terreo' },
  { codigo: '1382/178', descricao: 'Serviço de execução de tubos e conexões - água fria  - sobressolo 02' },
  { codigo: '1382/179', descricao: 'Serviço de execução de tubos e conexões - água fria  - sobressolo 03' },
  { codigo: '1382/180', descricao: 'Serviço de execução de tubos e conexões - água fria  - lazer' },
  { codigo: '1382/181', descricao: 'Serviço de execução de tubos e conexões - água fria  - panoramico' },
  { codigo: '1382/182', descricao: 'Serviço de execução de tubos e conexões - água fria  - pavimento tipo  ( 1° ao 36° pav )' },
  { codigo: '1382/183', descricao: 'Serviço de execução de tubos e conexões - água fria  - cobertura' },
  { codigo: '1382/184', descricao: 'Serviço de execução de tubos e conexões - água fria  - rooftop + mezanino' },
  { codigo: '1382/185', descricao: 'Serviço de execução de tubos e conexões - água fria  - casa de maquina' },
  { codigo: '1382/186', descricao: 'Serviço de execução de tubos e conexões - água quente  - pavimento tipo  ( 1° ao 36° pav )' },
  { codigo: '1382/187', descricao: 'Serviço de execução de tubos e conexões - água quente  - cobertura' },
  { codigo: '1382/188', descricao: 'Serviço de execução de tubos e conexões - água quente  - casa de maquinas' },
  { codigo: '1382/189', descricao: 'Serviço de execução de conjunto hidrometros apartamentos ( valvulas e conexões )' },
  { codigo: '1382/190', descricao: 'Serviço de execução de conjunto bombas recalque' },
  { codigo: '1382/191', descricao: 'Serviço de execução de conjunto bombas pressurização' },
  { codigo: '1382/192', descricao: 'Serviço de execução de conjunto estação redutora de pressão ( sistema f )' },
  { codigo: '1382/193', descricao: 'Serviço de execução de conjunto estação redutora de pressão ( sistema g )' },
  { codigo: '1382/194', descricao: 'Serviço de execução de conjunto estação redutora de pressão ( sistema condominio )' },
  { codigo: '1382/195', descricao: 'Serviço de execução de conjunto estação redutora de pressão ( sistema b )' },
  { codigo: '1382/196', descricao: 'Serviço de execução de conjunto estação redutora de pressão ( sistema c )' },
  { codigo: '1382/197', descricao: 'Serviço de execução de conjunto estação redutora de pressão ( sistema d )' },
  { codigo: '1382/198', descricao: 'Serviço de execução de conjunto estação redutora de pressão ( sistema e )' },
  { codigo: '1382/199', descricao: 'Serviço de execução de acabamentos ( ralos de fundo, aspiração e retorno )' },
  { codigo: '1382/200', descricao: 'Serviço de execução de barrilhetes e bombas ( bombas filtros e valvulas )' },
  { codigo: '1382/201', descricao: 'Serviço de execução de tubos e conexões ( pvc soldavel e ppr )' },
  { codigo: '1382/202', descricao: 'Serviço de execução de louças e metais - pavimento terreo' },
  { codigo: '1382/203', descricao: 'Serviço de execução de louças e metais - pavimento lazer' },
  { codigo: '1382/204', descricao: 'Serviço de execução de louças e metais - pavimento panoramico' },
  { codigo: '1382/205', descricao: 'Serviço de execução de louças e metais - pavimento rooftop + mezanino' },
  { codigo: '1382/206', descricao: 'Serviço de execução de louças e metais - pavimento casa de maq' },
  { codigo: '1382/207', descricao: 'Serviço de execução de louças e metais - pavimento tipo 1 ao 36' },
  { codigo: '1382/208', descricao: 'Serviço de execução de louças e metais - cobertura' },
  { codigo: '1382/209', descricao: 'Serviço de execução de caixas e acessorios - hidrante - pav tipo ( 1 ao 36 )' },
  { codigo: '1382/210', descricao: 'Serviço de execução de caixas e acessorios - hidrante - pav cobertura' },
  { codigo: '1382/211', descricao: 'Serviço de execução de caixas e acessorios - hidrante - pav rooftop + mezanino' },
  { codigo: '1382/212', descricao: 'Serviço de execução de tubos e conexões - hidrante - prumada vertical ( dividida em vãos )' },
  { codigo: '1382/213', descricao: 'Serviço de execução de tubos e conexões - hidrante - pav tipo ( 1 ao 36 )' },
  { codigo: '1382/214', descricao: 'Serviço de execução de tubos e conexões - hidrante - pav cobertura' },
  { codigo: '1382/215', descricao: 'Serviço de execução de tubos e conexões - hidrante - pav rooftop + mezanino' },
  { codigo: '1382/216', descricao: 'Serviço de execução de tubos e conexões - hidrante - pav casa de maquina' },
  { codigo: '1382/217', descricao: 'Serviço de execução de tubos e conexões - sprinkler - prumada vertical ( dividida por  vãos entre pa' },
  { codigo: '1382/218', descricao: 'Serviço de execução de tubos e conexões - sprinkler - conjunto valvula redutora de pressão' },
  { codigo: '1382/219', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento subsolo 4' },
  { codigo: '1382/220', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento subsolo 3' },
  { codigo: '1382/221', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento subsolo 2' },
  { codigo: '1382/222', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento subsolo 1' },
  { codigo: '1382/223', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento terreo' },
  { codigo: '1382/224', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento sobressolo 1' },
  { codigo: '1382/225', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento sobressolo 2' },
  { codigo: '1382/226', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento sobressolo 3' },
  { codigo: '1382/227', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento lazer' },
  { codigo: '1382/228', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento panoramico' },
  { codigo: '1382/229', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento tipo ( 1° ao 36° )' },
  { codigo: '1382/230', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento cobertura' },
  { codigo: '1382/231', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento rooftop + mezanino' },
  { codigo: '1382/232', descricao: 'Serviço de execução de tubos e conexões - sprinkler - pavimento casa de maquina' },
  { codigo: '1382/233', descricao: 'Serviço de execução de barrilhete bombas - casa de maquinas' },
  { codigo: '1382/234', descricao: 'Serviço de execução de  luminárias de emergencia  - subsolo 04 + subsolo 05' },
  { codigo: '1382/235', descricao: 'Serviço de execução de  luminárias de emergencia  - panoramico' },
  { codigo: '1382/236', descricao: 'Serviço de execução de  luminárias de emergencia  - sobressolo 03' },
  { codigo: '1382/237', descricao: 'Serviço de execução de luminárias de emergencia  - lazer' },
  { codigo: '1382/238', descricao: 'Serviço de execução de luminárias de emergencia  - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/239', descricao: 'Serviço de execução de luminárias de emergencia - pav cobertura' },
  { codigo: '1382/240', descricao: 'Serviço de execução de luminárias de emergencia - pav rooftop + mezanino rooftop' },
  { codigo: '1382/241', descricao: 'Serviço de execução de luminárias de emergencia  - pav casa de maquinas' },
  { codigo: '1382/242', descricao: 'Serviço de execução de luminárias de emergencia  - subsolo 03' },
  { codigo: '1382/243', descricao: 'Serviço de execução de luminárias de emergencia  - subsolo 02' },
  { codigo: '1382/244', descricao: 'Serviço de execução de luminárias de emergencia  - subsolo 01' },
  { codigo: '1382/245', descricao: 'Serviço de execução de luminárias de emergencia  - terreo' },
  { codigo: '1382/246', descricao: 'Serviço de execução de luminárias de emergencia  - sobressolo 01' },
  { codigo: '1382/247', descricao: 'Serviço de execução de luminárias de emergencia  - sobressolo 02' },
  { codigo: '1382/248', descricao: 'Serviço de execução de  extintores - subsolo 04 + subsolo 05' },
  { codigo: '1382/249', descricao: 'Serviço de execução de  extintores - subsolo 03' },
  { codigo: '1382/250', descricao: 'Serviço de execução de  extintores - lazer' },
  { codigo: '1382/251', descricao: 'Serviço de execução de  extintores - panoramico' },
  { codigo: '1382/252', descricao: 'Serviço de execução de  extintores - subsolo 01' },
  { codigo: '1382/253', descricao: 'Serviço de execução de extintores - terreo' },
  { codigo: '1382/254', descricao: 'Serviço de execução de extintores - sobressolo 01' },
  { codigo: '1382/255', descricao: 'Serviço de execução de extintores - sobressolo 02' },
  { codigo: '1382/256', descricao: 'Serviço de execução de extintores - sobressolo 03' },
  { codigo: '1382/257', descricao: 'Serviço de execução de extintores - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/258', descricao: 'Serviço de execução de extintores- pav cobertura' },
  { codigo: '1382/259', descricao: 'Serviço de execução de extintores- pav rooftop + mezanino rooftop' },
  { codigo: '1382/260', descricao: 'Serviço de execução de extintores - pav casa de maquinas' },
  { codigo: '1382/261', descricao: 'Serviço de execução de extintores - heliponto' },
  { codigo: '1382/262', descricao: 'Serviço de execução de extintores - subsolo 02' },
  { codigo: '1382/263', descricao: 'Serviço de execução de  infra sdai - subsolo 04' },
  { codigo: '1382/264', descricao: 'Serviço de execução de  infra sdai - subsolo 03' },
  { codigo: '1382/265', descricao: 'Serviço de execução de  infra sdai - subsolo 02' },
  { codigo: '1382/266', descricao: 'Serviço de execução de  infra sdai - subsolo 01' },
  { codigo: '1382/267', descricao: 'Serviço de execução de  infra sdai - terreo' },
  { codigo: '1382/268', descricao: 'Serviço de execução de  infra sdai - sobressolo 01' },
  { codigo: '1382/269', descricao: 'Serviço de execução de  infra sdai - sobressolo 02' },
  { codigo: '1382/270', descricao: 'Serviço de execução de  infra sdai - sobressolo 03' },
  { codigo: '1382/271', descricao: 'Serviço de execução de  infra sdai - lazer' },
  { codigo: '1382/272', descricao: 'Serviço de execução de  infra sdai - panoramico' },
  { codigo: '1382/273', descricao: 'Serviço de execução de  infra sdai - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/274', descricao: 'Serviço de execução de  infra  sdai - pav cobertura' },
  { codigo: '1382/275', descricao: 'Serviço de execução de  infra sdai - pav rooftop + mezanino rooftop' },
  { codigo: '1382/276', descricao: 'Serviço de execução de  infra sdai - pav casa de maquinas' },
  { codigo: '1382/277', descricao: 'Serviço de execução de  infra sdai - infra vertical ( dividido por vãos )' },
  { codigo: '1382/278', descricao: 'Serviço de execução de  cabeamento sdai - terreo' },
  { codigo: '1382/279', descricao: 'Serviço de execução de  cabeamento sdai - sobressolo 01' },
  { codigo: '1382/280', descricao: 'Serviço de execução de  cabeamento sdai - sobressolo 02' },
  { codigo: '1382/281', descricao: 'Serviço de execução de  cabeamento sdai - sobressolo 03' },
  { codigo: '1382/282', descricao: 'Serviço de execução de  cabeamento sdai - lazer' },
  { codigo: '1382/283', descricao: 'Serviço de execução de  cabeamento sdai - panoramico' },
  { codigo: '1382/284', descricao: 'Serviço de execução de  cabeamento sdai - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/285', descricao: 'Serviço de execução de  cabeamento  sdai - pav cobertura' },
  { codigo: '1382/286', descricao: 'Serviço de execução de  cabeamento sdai - pav rooftop + mezanino rooftop' },
  { codigo: '1382/287', descricao: 'Serviço de execução de  cabeamento sdai - pav casa de maquinas' },
  { codigo: '1382/288', descricao: 'Serviço de execução de  cabeamento sdai - infra vertical ( dividido por vãos )' },
  { codigo: '1382/289', descricao: 'Serviço de execução de cabeamento sdai - subsolo 02' },
  { codigo: '1382/290', descricao: 'Serviço de execução de cabeamento sdai - subsolo 01' },
  { codigo: '1382/291', descricao: 'Serviço de execução de cabeamento sdai - subsolo 04' },
  { codigo: '1382/292', descricao: 'Serviço de execução de cabeamento sdai - subsolo 03' },
  { codigo: '1382/293', descricao: 'Serviço de execução de  equipamentos sdai - terreo' },
  { codigo: '1382/294', descricao: 'Serviço de execução de  equipamentos sdai - sobressolo 01' },
  { codigo: '1382/295', descricao: 'Serviço de execução de  equipamentos sdai - sobressolo 02' },
  { codigo: '1382/296', descricao: 'Serviço de execução de  equipamentos sdai - sobressolo 03' },
  { codigo: '1382/297', descricao: 'Serviço de execução de  equipamentos sdai - lazer' },
  { codigo: '1382/298', descricao: 'Serviço de execução de  equipamentos sdai - panoramico' },
  { codigo: '1382/299', descricao: 'Serviço de execução de  equipamentos sdai - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/300', descricao: 'Serviço de execução de  equipamentos  sdai - pav cobertura' },
  { codigo: '1382/301', descricao: 'Serviço de execução de  equipamentos sdai - pav rooftop + mezanino rooftop' },
  { codigo: '1382/302', descricao: 'Serviço de execução de  equipamentos sdai - pav casa de maquinas' },
  { codigo: '1382/303', descricao: 'Serviço de execução de equipamentos sdai - subsolo 04' },
  { codigo: '1382/304', descricao: 'Serviço de execução de equipamentos sdai - subsolo 03' },
  { codigo: '1382/305', descricao: 'Serviço de execução de equipamentos sdai - subsolo 02' },
  { codigo: '1382/306', descricao: 'Serviço de execução de equipamentos sdai - subsolo 01' },
  { codigo: '1382/307', descricao: 'Serviço de execução de  tubos e conexões - gás - terreo' },
  { codigo: '1382/308', descricao: 'Serviço de execução de  tubos e conexões - gás - lazer' },
  { codigo: '1382/309', descricao: 'Serviço de execução de  tubos e conexões - gás - panoramico' },
  { codigo: '1382/310', descricao: 'Serviço de execução de  tubos e conexões  - gás - pav cobertura' },
  { codigo: '1382/311', descricao: 'Serviço de execução de  tubos e conexões - gás - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/312', descricao: 'Serviço de execução de  tubos e conexões - gás - pav rooftop + mezanino rooftop' },
  { codigo: '1382/313', descricao: 'Serviço de execução de tubos e conexões - gás - infra vertical ( dividido por vãos entre pavimentos' },
  { codigo: '1382/314', descricao: 'Serviço de execução de caixas, reguladores e valvulas gás - lazer' },
  { codigo: '1382/315', descricao: 'Serviço de execução de caixas, reguladores e valvulas gás - panoramico' },
  { codigo: '1382/316', descricao: 'Serviço de execução de caixas, reguladores e valvulas gás - pav tipo ( 1° ao 36 )' },
  { codigo: '1382/317', descricao: 'Serviço de execução de caixas, reguladores e valvulas gás - pav cobertura' },
  { codigo: '1382/318', descricao: 'Serviço de execução de caixas, reguladores e valvulas gás - pav rooftop + mezanino rooftop' },
  { codigo: '1382/319', descricao: 'Serviço de execução de anel intermediario  - spda -  lazer' },
  { codigo: '1382/320', descricao: 'Serviço de execução de anel intermediario  - spda -  2° pav' },
  { codigo: '1382/321', descricao: 'Serviço de execução de anel intermediario  - spda -  6° pav' },
  { codigo: '1382/322', descricao: 'Serviço de execução de anel intermediario  - spda -  10° pav' },
  { codigo: '1382/323', descricao: 'Serviço de execução de anel intermediario  - spda -  14° pav' },
  { codigo: '1382/324', descricao: 'Serviço de execução de anel intermediario  - spda -  18° pav' },
  { codigo: '1382/325', descricao: 'Serviço de execução de anel intermediario  - spda -  22° pav' },
  { codigo: '1382/326', descricao: 'Serviço de execução de anel intermediario  - spda -  26° pav' },
  { codigo: '1382/327', descricao: 'Serviço de execução de anel intermediario  - spda -  30° pav' },
  { codigo: '1382/328', descricao: 'Serviço de execução de anel intermediario  - spda -  34° pav' },
  { codigo: '1382/329', descricao: 'Serviço de execução de anel intermediario  - spda -  cobertura' },
  { codigo: '1382/330', descricao: 'Serviço de execução de anel coberta - spda -  heliponto' },
  { codigo: '1382/331', descricao: 'Serviço de execução de aterramento  - spda -  subsolo 4' },
  { codigo: '1382/332', descricao: 'Serviço de execução de subidas verticais ( dividida por vãos )' },
  { codigo: '1382/333', descricao: 'Administração de Obras - Engenheiro Instalações' },
  { codigo: '1382/334', descricao: 'Serviço de fechamento de passagens verticais em shafts.' },
]

// ============================================================
// Normalização e matching
// ============================================================

/**
 * Normaliza um texto pra comparação:
 * - lowercase, remove acentos (NFD + strip combining marks)
 * - tira prefixo "Serviço de execução de" / "Serviço de" / "Administração de"
 * - normaliza ordinais "2°", "2º", "2o" → "2" (e qualquer dígito-ordinal)
 * - colapsa whitespace
 * - tira pontuação trailing
 */
function normalize(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*servico de execucao de\s*/i, '')
    .replace(/^\s*servico de\s+/i, '')
    .replace(/^\s*administracao de\s+/i, '')
    .replace(/(\d+)[°ºo](?=\s|$|\b)/g, '$1')
    // sinônimos ortográficos: app usa "sobresolo" (1 's'), Informakon "sobressolo" (2 's')
    .replace(/sobressolo/g, 'sobresolo')
    // prefixo "instalacoes " redundante (app diz "INSTALAÇÕES EXTINTORES",
    // Informakon diz só "extintores")
    .replace(/^\s*instalacoes\s+(extintores?|luminarias?)\b/i, '$1')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim()
}

/** Fingerprint agressivo: só alfanuméricos. Robusto a whitespace e símbolos. */
function fingerprint(s: string): string {
  return normalize(s).replace(/[^a-z0-9]/g, '')
}

/** Stem simples: tira 's' final quando token tem >= 4 chars (handles plural PT-BR). */
function stem(t: string): string {
  return t.length >= 4 && t.endsWith('s') ? t.slice(0, -1) : t
}

/** Tokens normalizados (com stemming). Stop-tokens curtos removidos. */
function tokens(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2)
    .map(stem)
}

/** Jaccard de conjuntos de tokens (intersecção / união). */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const sa = new Set(a)
  const sb = new Set(b)
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

interface IndexedEntry {
  codigo: string
  norm: string
  fp: string
  toks: string[]
}

const INDEX: IndexedEntry[] = ENTRADAS.map(e => ({
  codigo: e.codigo,
  norm: normalize(e.descricao),
  fp: fingerprint(e.descricao),
  toks: tokens(e.descricao),
}))

const FP_MAP: Map<string, string> = new Map()
for (const e of INDEX) FP_MAP.set(e.fp, e.codigo)

/**
 * Overrides manuais (descrição app → código Informakon) para itens onde
 * a similaridade textual fica abaixo do threshold mas o usuário confirmou
 * o vínculo. Usa fingerprint pra robustez. Adicione novas entradas aqui
 * quando o fuzzy matcher não pegar.
 */
const OVERRIDES_FP: Map<string, string> = new Map([
  // 19.1.1 ADMINISTRAÇÃO OBRA ( MÊS ) ↔ 1382/333 Administração de Obras - Engenheiro Instalações
  [fingerprint('ADMINISTRAÇÃO OBRA ( MÊS )'), '1382/333'],
])

/**
 * Resolve o código Informakon (CT/Serv 1382/N) a partir da descrição do
 * detalhamento. Em ordem:
 *   1) match exato por fingerprint (alfanumérico)
 *   2) prefix match: 1 fingerprint é prefixo do outro, com sobreposição >= 20 chars
 *   3) similaridade Jaccard de tokens >= 0,7 (escolhe o maior score, com
 *      tiebreaker pelo maior overlap de prefixo de fingerprint)
 *
 * Retorna `null` quando nenhum match razoável é encontrado.
 */
export function getCodigoInformakon(descricao: string | null | undefined): string | null {
  if (!descricao) return null
  const fp = fingerprint(descricao)
  if (!fp) return null

  // 0) override manual (caso especial confirmado pelo usuário)
  const override = OVERRIDES_FP.get(fp)
  if (override) return override

  // 1) match exato por fingerprint
  const exact = FP_MAP.get(fp)
  if (exact) return exact

  // 2) prefix match (cobre descrições truncadas como 1382/4, 1382/116, 1382/138)
  const MIN_OVERLAP = 20
  for (const e of INDEX) {
    const minLen = Math.min(fp.length, e.fp.length)
    if (minLen < MIN_OVERLAP) continue
    if (fp.startsWith(e.fp) || e.fp.startsWith(fp)) return e.codigo
  }

  // 3) Jaccard de tokens >= 0,7
  const inputToks = tokens(descricao)
  if (inputToks.length === 0) return null

  let best: { codigo: string; score: number; fpOverlap: number } | null = null
  const THRESHOLD = 0.8
  for (const e of INDEX) {
    const score = jaccard(inputToks, e.toks)
    if (score < THRESHOLD) continue
    // tiebreaker: prefix overlap de fingerprint (mais "estrutural")
    let fpOverlap = 0
    const minLen = Math.min(fp.length, e.fp.length)
    while (fpOverlap < minLen && fp[fpOverlap] === e.fp[fpOverlap]) fpOverlap++

    if (
      !best ||
      score > best.score ||
      (score === best.score && fpOverlap > best.fpOverlap)
    ) {
      best = { codigo: e.codigo, score, fpOverlap }
    }
  }

  return best?.codigo ?? null
}
