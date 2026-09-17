-- ============================================================
-- Comorar — código de convite com valor padrão
-- Necessário para a restauração de backup criar a casa sem
-- informar o código manualmente.
-- ============================================================

alter table public.casas
  alter column codigo_convite
  set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
