-- ============================================================================
-- 076 — CONCILIAÇÃO INFORMAKON × FIP-WAVE  (somente leitura, nada é alterado)
--
-- Fonte: Controle_FIP_INFORMAKON_28JUL26.xlsx, aba "faturamento direto global"
--        181 entradas / 144 documentos / R$ 3.345.086,34 em NF
--        (R$ 928.368,80 já descontado nas med 1..4 + R$ 2.416.717,54 a descontar)
--
-- De-para macro item Informakon -> FIP-WAVE:
--   ELÉTRICA SUBESTAÇÃO=1  GERAÇÃO=2  ALIMENTAÇÃO ELÉTRICA=3
--   DISTRIBUIÇÃO ELÉTRICA=4  QUADROS ELÉTRICOS=6  LÓGICA INFRA SECA=7
--   ÁGUA PLUVIAL=8  ESGOTO=9  HIDRÁULICA=10  PISCINA E SPA=12
--   LOUÇAS E METAIS=13  COMBATE AO INCÊNDIO=14  SDAI=16  GÁS=17  SPDA=18
--   ADMINISTRAÇÃO OBRA=det 19.1.1   FECHAMENTOS SHAFTS=det 19.1.2
--   (sem NF no Informakon: 5 LUMINÁRIAS, 15 EXTINTOR E SINALIZAÇÃO)
--
-- Rodar bloco a bloco. Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabela temporária com os dados do Informakon (recriada a cada sessão).
-- Rode este bloco PRIMEIRO; os blocos C1..C4 dependem dele.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS tmp_informakon;
CREATE TEMP TABLE tmp_informakon (
  entrada        TEXT,
  numero_nf      TEXT,
  tipo_doc       TEXT,
  grupo_codigo   TEXT,   -- '1'..'18' ou '19.1.1' / '19.1.2'
  vlr_descontado NUMERIC(15,2),
  vlr_a_descontar NUMERIC(15,2)
);
INSERT INTO tmp_informakon (entrada, numero_nf, tipo_doc, grupo_codigo, vlr_descontado, vlr_a_descontar) VALUES
  ('154859/001','198','NF-e','1',5261.84,0.00),
  ('156445/001','529462','NF-e','1',15472.40,0.00),
  ('157045/001','206','NF-e','1',9007.04,0.00),
  ('158024/001','705','NFS-e','1',12500.00,0.00),
  ('154859/002','198','NF-e','2',19367.62,0.00),
  ('156445/002','529462','NF-e','2',1501.96,0.00),
  ('156652/001','51945','NF-e','2',2270.26,0.00),
  ('156703/001','531790','NF-e','2',1930.48,0.00),
  ('156870/001','105888','NF-e','2',21582.39,0.00),
  ('157009/001','53146','NF-e','2',450.00,0.00),
  ('157045/002','206','NF-e','2',1572.89,0.00),
  ('153488/001','144224','NF-e','3',8688.85,0.00),
  ('153498/001','1115','NF-e','3',6162.73,0.00),
  ('154950/001','4128','NF-e','3',21223.28,0.00),
  ('155199/001','103972','NF-e','3',12608.81,0.00),
  ('155645/001','115581','NF-e','3',35609.16,0.00),
  ('155801/001','201','NF-e','3',3533.32,0.00),
  ('155889/001','104790','NF-e','3',0.00,101351.02),
  ('156444/001','902880','NF-e','3',12301.04,0.00),
  ('156446/001','529966','NF-e','3',2468.97,0.00),
  ('156569/001','248202','NF-e','3',4714.85,0.00),
  ('156652/002','51945','NF-e','3',9944.74,0.00),
  ('157045/003','206','NF-e','3',5575.67,0.00),
  ('157343/001','4552','NF-e','3',662.33,9337.67),
  ('157431/001','105242','NF-e','3',0.00,31196.17),
  ('158237/001','56964','NF-e','3',28625.30,0.00),
  ('153457/001','8403','NF-e','4',4297.77,832.23),
  ('154097/001','521745','NF-e','4',0.00,16760.91),
  ('154724/001','46691','NF-e','4',13610.40,0.00),
  ('154908/001','524975','NF-e','4',0.00,15667.82),
  ('156442/001','528789','NF-e','4',5624.50,0.00),
  ('156576/001','51854','NF-e','4',0.00,1211.00),
  ('157045/004','206','NF-e','4',2368.78,0.00),
  ('157343/002','4552','NF-e','4',11076.80,0.00),
  ('157501/001','241621','NF-e','4',39.77,68.21),
  ('157502/001','1168917','NF-e','4',2187.17,0.00),
  ('158110/001','56570','NF-e','4',0.00,3292.00),
  ('158112/001','537926','NF-e','4',8955.88,515.37),
  ('157897/001','506','NF-e','6',13193.12,35559.78),
  ('153498/002','1115','NF-e','7',1060.07,0.00),
  ('153611/001','345013','NF-e','7',0.00,5195.02),
  ('154097/002','521745','NF-e','7',16182.58,578.32),
  ('154908/002','524975','NF-e','7',9014.03,0.00),
  ('155888/001','236881','NF-e','7',0.00,13680.00),
  ('157045/005','206','NF-e','7',2283.46,0.00),
  ('157984/001','56583','NF-e','7',8088.00,0.00),
  ('157985/001','1170350','NF-e','7',4461.22,569.18),
  ('158282/001','362193','NF-e','7',0.00,2730.30),
  ('158298/001','213117','NF-e','7',0.00,12650.70),
  ('158299/001','250513','NF-e','7',0.00,3697.00),
  ('154086/001','233482','NF-e','8',55232.06,26659.08),
  ('154859/003','198','NF-e','8',1561.87,0.00),
  ('154955/001','235394','NF-e','8',0.00,20000.00),
  ('155099/001','129977','NF-e','8',0.00,3147.02),
  ('155645/002','115581','NF-e','8',0.00,25000.00),
  ('155801/002','201','NF-e','8',0.00,1249.50),
  ('156451/001','237358','NF-e','8',0.00,62597.09),
  ('156452/001','237336','NF-e','8',0.00,52158.77),
  ('156549/001','237634','NF-e','8',0.00,43898.83),
  ('156574/001','237635','NF-e','8',0.00,91345.32),
  ('156657/001','237831','NF-e','8',0.00,2351.42),
  ('156660/001','3040','NF-e','8',0.00,4481.25),
  ('156664/001','9698','NF-e','8',0.00,15000.00),
  ('156914/001','3049','NF-e','8',0.00,4953.71),
  ('157101/001','1682004','NF-e','8',0.00,4514.00),
  ('158016/001','550','NFS-e','8',0.00,12560.00),
  ('153451/001','232900','NF-e','9',32699.15,2384.98),
  ('154086/002','233482','NF-e','9',0.00,2851.32),
  ('154087/001','233483','NF-e','9',6816.48,36305.92),
  ('154955/002','235394','NF-e','9',0.00,38857.72),
  ('155645/003','115581','NF-e','9',24242.07,757.93),
  ('155646/001','948','NF-e','9',0.00,28688.40),
  ('155801/003','201','NF-e','9',0.00,435.99),
  ('155881/001','236846','NF-e','9',0.00,426.26),
  ('155883/001','236847','NF-e','9',0.00,3749.53),
  ('156451/002','237358','NF-e','9',0.00,62597.08),
  ('156452/002','237336','NF-e','9',0.00,52158.76),
  ('156549/002','237634','NF-e','9',0.00,43898.82),
  ('156574/002','237635','NF-e','9',0.00,23249.58),
  ('156660/002','3040','NF-e','9',0.00,4481.25),
  ('156664/002','9698','NF-e','9',0.00,15000.00),
  ('156914/002','3049','NF-e','9',0.00,4060.49),
  ('157222/001','249237','NF-e','9',0.00,6832.00),
  ('157503/001','239311','NF-e','9',0.00,8095.75),
  ('157508/001','239175','NF-e','9',0.00,7396.59),
  ('158030/001','75','NFS-e','9',0.00,15840.00),
  ('158111/001','1698965','NF-e','9',0.00,5305.60),
  ('154082/001','234176','NF-e','10',4895.82,2002.60),
  ('154220/001','234177','NF-e','10',80005.22,81793.60),
  ('155645/004','115581','NF-e','10',0.00,8293.71),
  ('155801/004','201','NF-e','10',0.00,4253.31),
  ('156548/001','115811','NF-e','10',0.00,7229.04),
  ('156553/001','90877','NF-e','10',0.00,2500.00),
  ('156653/001','237898','NF-e','10',0.00,13252.84),
  ('156660/003','3040','NF-e','10',0.00,4481.25),
  ('156664/003','9698','NF-e','10',0.00,13310.00),
  ('156826/001','130360','NF-e','10',0.00,10783.00),
  ('156830/001','5097120','NF-e','10',0.00,43529.50),
  ('156831/001','5095873','NF-e','10',0.00,50984.73),
  ('156914/003','3049','NF-e','10',0.00,2437.05),
  ('157684/001','200699','NF-e','10',0.00,190283.69),
  ('157686/001','200700','NF-e','10',0.00,156645.07),
  ('157960/001','130624','NF-e','10',0.00,19867.00),
  ('158040/001','2591','NF-e','10',0.00,2141.64),
  ('157027/001','238634','NF-e','12',0.00,23643.60),
  ('156602/001','118418','NF-e','13',0.00,6610.06),
  ('156603/001','60944','NF-e','13',0.00,383.88),
  ('156913/001','63042','NF-e','13',0.00,938.39),
  ('156995/001','10018','NF-e','13',0.00,15.43),
  ('156997/001','26920','NF-e','13',0.00,876.61),
  ('156998/001','122308','NF-e','13',0.00,1670.74),
  ('157276/001','64321','NF-e','13',0.00,259.59),
  ('157297/001','333','NF-e','13',0.00,50.95),
  ('155558/001','2439690','NF-e','14',1443.22,8554.82),
  ('155563/001','26891','NF-e','14',56841.77,236776.46),
  ('155765/001','2442603','NF-e','14',0.00,82467.27),
  ('156359/001','209312','NF-e','14',0.00,1988.52),
  ('156496/001','1343972','NF-e','14',0.00,21207.18),
  ('156498/001','1343971','NF-e','14',0.00,15034.40),
  ('156566/001','27392','NF-e','14',0.00,5330.07),
  ('156658/001','248511','NF-e','14',0.00,3165.10),
  ('156661/001','1348085','NF-e','14',0.00,1620.36),
  ('156704/001','2454173','NF-e','14',0.00,22955.20),
  ('157007/001','5399','NF-e','14',0.00,5618.77),
  ('157045/006','206','NF-e','14',12026.82,0.00),
  ('157103/001','2461510','NF-e','14',0.00,808.42),
  ('157220/001','1167874','NF-e','14',0.00,9020.55),
  ('157504/001','535108','NF-e','14',0.00,1166.26),
  ('157712/001','66410','NF-e','14',0.00,4260.00),
  ('157731/001','2472615','NF-e','14',0.00,3127.20),
  ('157976/001','2475010','NF-e','14',0.00,11962.08),
  ('157981/001','537106','NF-e','14',0.00,436.49),
  ('158113/001','5532','NF-e','14',0.00,2259.91),
  ('158204/001','5545','NF-e','14',0.00,13198.09),
  ('155252/001','1160772','NF-e','16',8774.56,4968.29),
  ('155253/001','236429','NF-e','16',0.00,109.35),
  ('157220/002','1167874','NF-e','16',0.00,45679.33),
  ('154725/001','235130','NF-e','17',0.00,5932.09),
  ('156554/001','196669','NF-e','17',22833.30,7478.69),
  ('156555/001','196648','NF-e','17',0.00,35768.55),
  ('153487/001','519631','NF-e','18',14922.69,0.00),
  ('153496/001','44178','NF-e','18',22751.72,0.00),
  ('154782/001','297553','NF-e','18',5847.64,0.00),
  ('154783/001','2139','NFS-e','18',6449.30,0.00),
  ('154859/004','198','NF-e','18',9713.84,0.00),
  ('156974/001','6150','NF-e','18',5167.67,3265.48),
  ('157045/007','206','NF-e','18',8729.42,0.00),
  ('153751/001','87','NFS-e','19.1.1',13500.00,0.00),
  ('153753/001','81','NFS-e','19.1.1',16000.00,0.00),
  ('153755/001','2','NFS-e','19.1.1',8500.00,0.00),
  ('154577/001','88','NFS-e','19.1.1',13500.00,0.00),
  ('154579/001','83','NFS-e','19.1.1',16000.00,0.00),
  ('154581/001','3','NFS-e','19.1.1',8500.00,0.00),
  ('155564/001','90','NFS-e','19.1.1',13500.00,0.00),
  ('155566/001','85','NFS-e','19.1.1',16000.00,0.00),
  ('155568/001','4','NFS-e','19.1.1',8500.00,0.00),
  ('155649/001','2114','NF-e','19.1.1',11934.70,0.00),
  ('156283/001','2144','NF-e','19.1.1',0.00,6384.90),
  ('157037/001','91','NFS-e','19.1.1',13500.00,0.00),
  ('157039/001','5','NFS-e','19.1.1',8500.00,0.00),
  ('157040/001','87','NFS-e','19.1.1',16000.00,0.00),
  ('158097/001','90','NFS-e','19.1.1',16000.00,0.00),
  ('158100/001','6','NFS-e','19.1.1',8500.00,0.00),
  ('158101/001','93','NFS-e','19.1.1',13500.00,0.00),
  ('153996/001','896743','NF-e','19.1.2',0.00,12249.23),
  ('153997/001','16977','NF-e','19.1.2',0.00,3086.71),
  ('154663/001','246277','NF-e','19.1.2',0.00,3764.00),
  ('154735/001','246647','NF-e','19.1.2',0.00,3188.10),
  ('154767/001','1236','NF-e','19.1.2',0.00,3316.00),
  ('154768/001','349255','NF-e','19.1.2',0.00,5694.95),
  ('154780/001','115309','NF-e','19.1.2',0.00,139960.49),
  ('155098/001','4413','NF-e','19.1.2',0.00,7450.50),
  ('155202/001','54613','NF-e','19.1.2',0.00,4936.29),
  ('155560/001','208930','NF-e','19.1.2',0.00,7804.70),
  ('155619/001','104132','NF-e','19.1.2',0.00,4334.07),
  ('155648/001','288062','NF-e','19.1.2',0.00,3184.75),
  ('155667/001','2185','NFS-e','19.1.2',0.00,2963.68),
  ('156471/001','115812','NF-e','19.1.2',0.00,12739.41),
  ('156565/001','288203','NF-e','19.1.2',0.00,669.51),
  ('156833/001','1318','NF-e','19.1.2',0.00,3444.53),
  ('156974/002','6150','NF-e','19.1.2',0.00,966.85);


-- Conferência da carga: deve retornar 181 | 928368.80 | 2416717.54 | 3345086.34
SELECT COUNT(*) AS linhas,
       SUM(vlr_descontado)  AS ja_descontado,
       SUM(vlr_a_descontar) AS a_descontar,
       SUM(vlr_descontado + vlr_a_descontar) AS total_nf_informakon
  FROM tmp_informakon;


-- ============================================================================
-- C1 — RESUMO: total de NF lançada no Informakon × total lançado no FIP-WAVE
-- ============================================================================
WITH info AS (
  SELECT SUM(vlr_descontado + vlr_a_descontar) AS total FROM tmp_informakon
),
sis AS (
  SELECT COALESCE(SUM(nf.valor), 0) AS total, COUNT(*) AS qtd
    FROM notas_fiscais_fat_direto nf
    JOIN solicitacoes_fat_direto s ON s.id = nf.solicitacao_id
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
)
SELECT info.total                    AS nf_informakon,
       sis.total                     AS nf_sistema,
       sis.qtd                       AS qtd_nf_sistema,
       info.total - sis.total        AS falta_lancar_no_sistema
  FROM info, sis;


-- ============================================================================
-- C2 — NF a NF: o que existe no Informakon e NÃO existe no FIP-WAVE
--      (o de-para é pelo número da nota, ignorando prefixo NF-e / NFS-e)
-- ============================================================================
WITH info AS (
  SELECT numero_nf,
         MIN(tipo_doc)                              AS tipo_doc,
         STRING_AGG(DISTINCT grupo_codigo, ', ')    AS grupos,
         SUM(vlr_descontado + vlr_a_descontar)      AS valor_informakon
    FROM tmp_informakon
   GROUP BY numero_nf
),
sis AS (
  SELECT REGEXP_REPLACE(nf.numero_nf, '\D', '', 'g') AS num,
         SUM(nf.valor)                                AS valor_sistema,
         STRING_AGG(DISTINCT nf.emitente, ' / ')      AS emitentes
    FROM notas_fiscais_fat_direto nf
    JOIN solicitacoes_fat_direto s ON s.id = nf.solicitacao_id
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
   GROUP BY 1
)
SELECT COALESCE(info.numero_nf, sis.num)                       AS numero_nf,
       info.tipo_doc,
       info.grupos                                             AS grupo_informakon,
       info.valor_informakon,
       sis.valor_sistema,
       sis.emitentes,
       CASE
         WHEN sis.num IS NULL                                       THEN 'SO NO INFORMAKON — lancar no sistema'
         WHEN info.numero_nf IS NULL                                THEN 'SO NO SISTEMA — conferir com a FIP'
         WHEN ABS(info.valor_informakon - sis.valor_sistema) > 0.05  THEN 'VALOR DIVERGENTE'
         ELSE 'OK'
       END                                                     AS situacao,
       COALESCE(info.valor_informakon, 0) - COALESCE(sis.valor_sistema, 0) AS diferenca
  FROM info
  FULL OUTER JOIN sis ON sis.num = info.numero_nf
 WHERE sis.num IS NULL
    OR info.numero_nf IS NULL
    OR ABS(info.valor_informakon - sis.valor_sistema) > 0.05
 ORDER BY ABS(COALESCE(info.valor_informakon, 0) - COALESCE(sis.valor_sistema, 0)) DESC;


-- ============================================================================
-- C3 — POR GRUPO MACRO: NF lançada no Informakon × NF alocada no FIP-WAVE
--      Mostra onde falta nota e quanto.
-- ============================================================================
WITH info AS (
  SELECT grupo_codigo,
         SUM(vlr_descontado)                    AS ja_descontado_info,
         SUM(vlr_a_descontar)                   AS a_descontar_info,
         SUM(vlr_descontado + vlr_a_descontar)  AS total_info
    FROM tmp_informakon
   GROUP BY grupo_codigo
),
-- NF do sistema rateada pro-rata pelos itens da solicitação (mesma regra do
-- lib/db/informacon-data.ts), agregada por grupo macro.
sis AS (
  SELECT CASE WHEN g.codigo = '19' THEN d.codigo ELSE g.codigo END AS grupo_codigo,
         SUM(i.valor_total / NULLIF(tot.total_sol, 0) * tot.total_nf) AS nf_alocada_sistema
    FROM itens_solicitacao_fat_direto i
    JOIN detalhamentos d  ON d.id = i.detalhamento_id
    JOIN tarefas       t  ON t.id = d.tarefa_id
    JOIN grupos_macro  g  ON g.id = t.grupo_macro_id
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
    JOIN LATERAL (
      SELECT (SELECT COALESCE(SUM(i2.valor_total), 0)
                FROM itens_solicitacao_fat_direto i2
               WHERE i2.solicitacao_id = s.id AND i2.detalhamento_id IS NOT NULL) AS total_sol,
             (SELECT COALESCE(SUM(nf.valor), 0)
                FROM notas_fiscais_fat_direto nf
               WHERE nf.solicitacao_id = s.id) AS total_nf
    ) tot ON TRUE
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
     AND tot.total_sol > 0
   GROUP BY 1
)
SELECT COALESCE(info.grupo_codigo, sis.grupo_codigo)      AS grupo,
       info.total_info                                    AS nf_informakon,
       ROUND(COALESCE(sis.nf_alocada_sistema, 0), 2)      AS nf_sistema,
       ROUND(COALESCE(info.total_info, 0)
             - COALESCE(sis.nf_alocada_sistema, 0), 2)    AS falta_no_sistema,
       info.ja_descontado_info,
       info.a_descontar_info
  FROM info
  FULL OUTER JOIN sis ON sis.grupo_codigo = info.grupo_codigo
 ORDER BY 4 DESC NULLS LAST;


-- ============================================================================
-- C4 — MEDIÇÃO 4: desconto do Informakon (R$ 424.613,03) × material medido
--      no FIP-WAVE, grupo a grupo. Explica o gap do rodapé.
-- ============================================================================
WITH info_med4 AS (
  -- valores da aba "med 4" agregados por grupo (constantes da planilha)
  SELECT * FROM (VALUES
    ('19.1.1', 76000.00), ('3',  71054.98), ('14', 56841.77), ('10', 51751.52),
    ('4',     29938.30),  ('8',  26831.54), ('9',  24242.07), ('7',  21563.25),
    ('2',     16680.42),  ('18', 14393.96), ('1',  13234.47), ('6',  13193.12),
    ('16',     6979.66),  ('17',  1907.97)
  ) AS t(grupo_codigo, desconto_informakon)
),
sis_med4 AS (
  SELECT CASE WHEN g.codigo = '19' THEN d.codigo ELSE g.codigo END AS grupo_codigo,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS material_medido,
         SUM(COALESCE(mi.nf_material_descontada, 0))                    AS desconto_sistema
    FROM medicao_itens mi
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
    JOIN tarefas       t ON t.id = d.tarefa_id
    JOIN grupos_macro  g ON g.id = t.grupo_macro_id
   WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
     AND mi.quantidade_medida > 0
   GROUP BY 1
)
SELECT COALESCE(i.grupo_codigo, s.grupo_codigo)              AS grupo,
       ROUND(COALESCE(s.material_medido, 0), 2)              AS material_medido_sistema,
       COALESCE(i.desconto_informakon, 0)                    AS desconto_informakon,
       ROUND(COALESCE(s.desconto_sistema, 0), 2)             AS desconto_sistema,
       ROUND(COALESCE(i.desconto_informakon, 0)
             - COALESCE(s.desconto_sistema, 0), 2)           AS gap
  FROM info_med4 i
  FULL OUTER JOIN sis_med4 s ON s.grupo_codigo = i.grupo_codigo
 ORDER BY 5 DESC NULLS LAST;
