-- Categorias personalizáveis por casa.
-- 1) coluna jsonb em casas: [{id, label}], ordem = ordem de exibição
-- 2) despesas/recorrencias.categoria passam de enum fixo para text (aceita ids novos)

alter table public.despesas
  alter column categoria type text;

alter table public.recorrencias
  alter column categoria type text;

alter table public.casas
  add column if not exists categorias jsonb not null default '[
    {"id":"aluguel","label":"Aluguel"},
    {"id":"luz","label":"Luz"},
    {"id":"agua","label":"Água"},
    {"id":"internet","label":"Internet"},
    {"id":"mercado","label":"Mercado"},
    {"id":"outro","label":"Outro"}
  ]'::jsonb;