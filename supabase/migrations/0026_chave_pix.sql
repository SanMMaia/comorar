-- Comorar — chave Pix por morador

-- 1) nova coluna
alter table public.casa_morador add column chave_pix text;

-- 2) RLS: morador atualiza a própria linha (chave_pix)
create policy casa_morador_update_self on public.casa_morador
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3) RPC: retornar chave_pix
drop function if exists public.casa_moradores(uuid);
create function public.casa_moradores(p_casa_id uuid)
returns table (
  id uuid,
  user_id uuid,
  nome text,
  email text,
  role text,
  tipo text,
  chave_pix text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id,
         m.user_id,
         case
           when m.user_id is null then m.nome
           else coalesce(
             u.raw_user_meta_data->>'full_name',
             u.raw_user_meta_data->>'name',
             split_part(u.email, '@', 1)
           )
         end as nome,
         coalesce(m.email, u.email) as email,
         m.role,
         case when m.user_id is null then 'extra' else 'usuario' end as tipo,
         m.chave_pix
  from casa_morador m
  left join auth.users u on u.id = m.user_id
  where m.casa_id = p_casa_id
    and m.ativo
  order by m.criado_em;
$$;

revoke execute on function public.casa_moradores(uuid) from public, anon;
grant execute on function public.casa_moradores(uuid) to authenticated;
