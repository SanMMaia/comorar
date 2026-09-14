-- Corrige join_casa: o alvo do ON CONFLICT deve casar com o índice parcial
-- casa_morador_casa_user_uniq (casa_id, user_id) WHERE user_id IS NOT NULL.
-- A migração 0004 (morador sem app) tornou user_id nullable, então não há
-- unique constraint simples em (casa_id, user_id).
create or replace function public.join_casa(p_codigo text)
returns public.casas
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_casa public.casas;
begin
  select * into v_casa
    from public.casas
    where codigo_convite = upper(trim(p_codigo));

  if not found then
    raise exception 'código de convite inválido';
  end if;

  insert into public.casa_morador (casa_id, user_id, role)
    values (v_casa.id, auth.uid(), 'member')
    on conflict (casa_id, user_id) where user_id is not null
    do update set ativo = true;

  return v_casa;
end;
$$;