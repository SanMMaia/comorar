-- ============================================================
-- Remove tabela órfã orcamento_ajustes (sem políticas, sem uso)
-- e fixa search_path do trigger de touch.
-- ============================================================

drop table public.orcamento_ajustes;

create or replace function public.trg_orcamento_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

revoke execute on function public.trg_orcamento_touch() from public, anon, authenticated;