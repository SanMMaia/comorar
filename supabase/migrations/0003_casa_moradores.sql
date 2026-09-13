-- ============================================================
-- Comorar — RPC de moradores da casa
-- Retorna nome/email dos moradores ativos. Lê auth.users com
-- SECURITY DEFINER (o cliente anon não acessa essa tabela).
-- ============================================================

create or replace function public.casa_moradores(p_casa_id uuid)
returns table (user_id uuid, nome text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id,
         coalesce(
           u.raw_user_meta_data->>'full_name',
           u.raw_user_meta_data->>'name',
           split_part(u.email, '@', 1)
         ) as nome,
         u.email as email
  from casa_morador m
  join auth.users u on u.id = m.user_id
  where m.casa_id = p_casa_id
    and m.ativo
  order by m.criado_em;
$$;

revoke execute on function public.casa_moradores(uuid) from public, anon;
grant execute on function public.casa_moradores(uuid) to authenticated;