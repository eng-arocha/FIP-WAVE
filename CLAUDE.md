@AGENTS.md

# Regras Permanentes do Projeto FIP-WAVE

## REGRA 1 — Migrations SQL
Sempre que criar um arquivo `.sql` de migration:
1. Executar `git add → commit → push` imediatamente
2. Colar o conteúdo SQL completo no chat para o usuário copiar e colar no Supabase SQL Editor

## REGRA 2 — Qualquer arquivo novo
Sempre que criar qualquer arquivo novo (`.ts`, `.tsx`, `.sql`, `.json`, etc.):
- Executar `git add → commit → push` imediatamente após criar/editar

## REGRA 3 — Nunca misturar projetos
Este projeto é APP-GESTAO-CONTRATO (FIP-WAVE).
NUNCA misturar com APP-GESTAO-OBRAS ou qualquer outro projeto.

## REGRA 4 — Deploy
Só fazer deploy (merge para main + push) quando o usuário pedir explicitamente.
Branch de desenvolvimento: `claude/wave-financial-control-sV85i`
Deploy vai para: `main` → Vercel `fip-wave.vercel.app`
