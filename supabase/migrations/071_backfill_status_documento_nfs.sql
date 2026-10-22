-- Migration 071: Backfill status_documento e campos NF em solicitacoes_fat_direto
--
-- Problema: criarNotaFiscal() gravava NFs em notas_fiscais_fat_direto mas
-- não atualizava os campos legacy (nf_numero, nf_data, nf_pdf_url,
-- status_documento) em solicitacoes_fat_direto. Isso deixava view=com-nf
-- vazia e a coluna NF PDF sem ícone em view=aprovadas.
--
-- Esta migration corrige retroativamente os registros existentes.

-- 1. Marca como 'nf_recebida' todas as solicitações que têm ao menos uma
--    NF ativa (aprovada ou aguardando_aprovacao) mas ainda estão 'pendente_nf'.
UPDATE solicitacoes_fat_direto s
SET status_documento = 'nf_recebida'
WHERE s.status_documento = 'pendente_nf'
  AND EXISTS (
    SELECT 1
    FROM notas_fiscais_fat_direto n
    WHERE n.solicitacao_id = s.id
      AND n.status IN ('aprovada', 'aguardando_aprovacao')
  );

-- 2. Preenche nf_numero / nf_data a partir da primeira NF aprovada (ou
--    aguardando) quando o campo ainda está vazio — para exibição na tabela.
UPDATE solicitacoes_fat_direto s
SET
  nf_numero = sub.numero_nf,
  nf_data   = sub.data_emissao
FROM (
  SELECT DISTINCT ON (n.solicitacao_id)
    n.solicitacao_id,
    n.numero_nf,
    n.data_emissao
  FROM notas_fiscais_fat_direto n
  WHERE n.status IN ('aprovada', 'aguardando_aprovacao')
  ORDER BY n.solicitacao_id,
           CASE n.status WHEN 'aprovada' THEN 0 ELSE 1 END,
           n.created_at
) sub
WHERE s.id = sub.solicitacao_id
  AND (s.nf_numero IS NULL OR s.nf_numero = '');

-- 3. Preenche nf_pdf_url a partir da primeira NF com arquivo, se vazio.
UPDATE solicitacoes_fat_direto s
SET nf_pdf_url = sub.arquivo_url
FROM (
  SELECT DISTINCT ON (n.solicitacao_id)
    n.solicitacao_id,
    n.arquivo_url
  FROM notas_fiscais_fat_direto n
  WHERE n.status IN ('aprovada', 'aguardando_aprovacao')
    AND n.arquivo_url IS NOT NULL
  ORDER BY n.solicitacao_id,
           CASE n.status WHEN 'aprovada' THEN 0 ELSE 1 END,
           n.created_at
) sub
WHERE s.id = sub.solicitacao_id
  AND s.nf_pdf_url IS NULL;
