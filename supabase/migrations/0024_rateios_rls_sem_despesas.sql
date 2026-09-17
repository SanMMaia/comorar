-- ============================================================
-- Comorar — policies de rateios sem depender da RLS de despesas
-- As policies de insert/update/delete em rateios consultavam
-- `despesas` por subquery; com a RLS de visibilidade (0021) isso
-- bloqueava o fluxo de Pagar para moradores. Usamos helpers
-- SECURITY DEFINER (que ignoram RLS) no lugar.
-- ============================================================

create or replace function public.sou_membro_da_despesa(p_despesa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.despesas d
    join public.casa_morador m on m.casa_id = d.casa_id
    where d.id = p_despesa_id
      and m.user_id = auth.uid()
      and m.ativo
  );
$$;

revoke execute on function public.sou_membro_da_despesa(uuid) from public, anon;
grant execute on function public.sou_membro_da_despesa(uuid) to authenticated;

drop policy if exists rateios_insert on public.rateios;
create policy rateios_insert on public.rateios
  for insert to authenticated
  with check (public.sou_membro_da_despesa(despesa_id));

drop policy if exists rateios_update on public.rateios;
create policy rateios_update on public.rateios
  for update to authenticated
  using (
    public.sou_owner_da_despesa(despesa_id)
    or morador_id = public.meu_morador_da_despesa(despesa_id)
  );

drop policy if exists rateios_delete on public.rateios;
create policy rateios_delete on public.rateios
  for delete to authenticated
  using (
    public.sou_owner_da_despesa(despesa_id)
    or morador_id = public.meu_morador_da_despesa(despesa_id)
  );
