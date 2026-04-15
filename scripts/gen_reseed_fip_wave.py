"""
Gera SQL UPSERT a partir de `docs/ORÇAMANETO FIP-WAVE - BASE.xlsx`.
Alinha valores oficiais com os registros existentes em grupos_macro/tarefas/detalhamentos
pelo código (1, 1.1, 1.1.1 ...). Descrições preservadas. Valores corrigidos.

Uso:
    python scripts/gen_reseed_fip_wave.py > supabase/migrations/009_reseed_fip_wave_base.sql

Depois execute esse SQL no Supabase SQL Editor (ou `supabase db push`).
"""
import openpyxl
from pathlib import Path

XLSX = Path('docs/ORÇAMANETO FIP-WAVE - BASE.xlsx')

def esc(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''").strip() + "'"

wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb['BASE DADOS']

rows = []
for row in ws.iter_rows(min_row=3, values_only=True):
    if row[1] is None and row[3] is None:
        continue
    rows.append({
        'nivel': row[1],
        'disciplina': (row[2] or '').strip() if row[2] else None,
        'codigo': str(row[3]).strip() if row[3] is not None else None,
        'atividade': (row[4] or '').strip() if row[4] else None,
        'local': (row[5] or '').strip() if row[5] else None,
        'qtde': row[6] or 0,
        'mat_unit': row[7] or 0,
        'mat_total': row[8] or 0,
        'mo_unit': row[9] or 0,
        'mo_total': row[10] or 0,
        'total': row[11] or 0,
    })

print("-- =============================================================")
print("-- Migration 009: Re-seed FIP × WAVE com valores oficiais da BASE")
print(f"-- Fonte: {XLSX.name}")
print(f"-- Grupos: {sum(1 for r in rows if r['nivel']==1)} | Tarefas: {sum(1 for r in rows if r['nivel']==2)} | Detalhamentos: {sum(1 for r in rows if r['nivel']==3)}")
print("-- Aplica correções apenas no contrato FIP × WAVE (assume único contrato ou busca por nome).")
print("-- =============================================================")
print()
print("DO $$")
print("DECLARE v_contrato_id UUID;")
print("BEGIN")
print("  -- Localiza contrato FIP × WAVE (ajuste o WHERE se houver múltiplos)")
print("  SELECT id INTO v_contrato_id FROM contratos ORDER BY created_at LIMIT 1;")
print("  IF v_contrato_id IS NULL THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;")
print()

# Grupos Macro (nivel 1)
print("  -- ====== GRUPOS MACRO ======")
for r in rows:
    if r['nivel'] != 1: continue
    codigo = r['codigo']
    print(f"  UPDATE grupos_macro SET "
          f"valor_contratado = {r['total']:.2f}, "
          f"disciplina = {esc(r['disciplina'])} "
          f"WHERE contrato_id = v_contrato_id AND codigo = {esc(codigo)};")

print()
print("  -- ====== TAREFAS ======")
for r in rows:
    if r['nivel'] != 2: continue
    codigo = r['codigo']
    codigo_grupo = codigo.split('.')[0]
    print(f"  UPDATE tarefas SET "
          f"valor_total = {r['total']:.2f}, "
          f"valor_material = {r['mat_total']:.2f}, "
          f"valor_servico = {r['mo_total']:.2f}, "
          f"quantidade_contratada = {r['qtde']}, "
          f"disciplina = {esc(r['disciplina'])} "
          f"WHERE codigo = {esc(codigo)} AND grupo_macro_id IN "
          f"(SELECT id FROM grupos_macro WHERE contrato_id = v_contrato_id AND codigo = {esc(codigo_grupo)});")

print()
print("  -- ====== DETALHAMENTOS ======")
for r in rows:
    if r['nivel'] != 3: continue
    codigo = r['codigo']
    parts = codigo.split('.')
    codigo_tarefa = '.'.join(parts[:2])
    codigo_grupo = parts[0]
    # valor_total em detalhamentos é GENERATED — não seta direto
    print(f"  UPDATE detalhamentos SET "
          f"quantidade_contratada = {r['qtde']}, "
          f"valor_unitario = {(r['total'] / r['qtde']) if r['qtde'] else 0:.4f}, "
          f"valor_material_unit = {r['mat_unit']:.4f}, "
          f"valor_servico_unit = {r['mo_unit']:.4f}, "
          f"disciplina = {esc(r['disciplina'])}, "
          f"local = {esc(r['local'] or 'TORRE')} "
          f"WHERE codigo = {esc(codigo)} AND tarefa_id IN "
          f"(SELECT t.id FROM tarefas t JOIN grupos_macro g ON g.id = t.grupo_macro_id "
          f"WHERE g.contrato_id = v_contrato_id AND g.codigo = {esc(codigo_grupo)} AND t.codigo = {esc(codigo_tarefa)});")

print()
print("  RAISE NOTICE 'Re-seed FIP × WAVE concluído';")
print("END $$;")
