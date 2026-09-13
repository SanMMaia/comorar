-- ============================================================
-- Comorar — morador sem app + identidade unificada por casa_morador
-- ============================================================

-- 1) Permite criar morador que não acessa o app (user_id NULL + nome/email)
alter table public.casa_morador alter column user_id drop not null;
alter table public.casa_morador add column nome text;
alter table public.casa_morador add column email text;

alter table public.casa_morador drop constraint if exists casa_morador_casa_id_user_id_key;
create unique index casa_morador_casa_user_uniq
  on public.casa_morador (casa_id, user_id)
  where user_id is not null;

-- 2) rateios.morador_id passa a apontar para casa_morador.id (permite rateio p/ morador sem app)
alter table public.rateios drop constraint if exists rateios_morador_id_fkey;
update public.rateios r
  set morador_id = m.id
  from public.despesas d, public.casa_morador m
  where d.id = r.despesa_id
    and m.casa_id = d.casa_id
    and m.user_id = r.morador_id;
alter table public.rateios
  add constraint rateios_morador_id_fkey
  foreign key (morador_id) references public.casa_morador(id) on delete cascade;

-- 3) despesas.pago_por passa a apontar para casa_morador.id
alter table public.despesas drop constraint if exists despesas_pago_por_fkey;
update public.despesas d
  set pago_por = m.id
  from public.casa_morador m
  where m.casa_id = d.casa_id
    and m.user_id = d.pago_por;
alter table public.despesas
  add constraint despesas_pago_por_fkey
  foreign key (pago_por) references public.casa_morador(id) on delete set null;

-- 4) recorrencias.pagador_padrao passa a apontar para casa_morador.id
alter table public.recorrencias drop constraint if exists recorrencias_pagador_padrao_fkey;
update public.recorrencias r
  set pagador_padrao = m.id
  from public.casa_morador m
  where m.casa_id = r.casa_id
    and m.user_id = r.pagador_padrao;
alter table public.recorrencias
  add constraint recorrencias_pagador_padrao_fkey
  foreign key (pagador_padrao) references public.casa_morador(id) on delete set null;

-- 5) RLS: só o responsável cria/edita/remove moradores sem app
create policy casa_morador_insert_guest on public.casa_morador
  for insert to authenticated
  with check (user_id is null and public.is_casa_owner(casa_id));

create policy casa_morador_update_guest on public.casa_morador
  for update to authenticated
  using (user_id is null and public.is_casa_owner(casa_id))
  with check (public.is_casa_owner(casa_id));

create policy casa_morador_delete_guest on public.casa_morador
  for delete to authenticated
  using (user_id is null and public.is_casa_owner(casa_id));

-- 6) RPC unificado: devolve id (casa_morador), user_id, nome, email, role e tipo
drop function if exists public.casa_moradores(uuid);
create function public.casa_moradores(p_casa_id uuid)
returns table (id uuid, user_id uuid, nome text, email text, role text, tipo text)
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
         case when m.user_id is null then 'extra' else 'usuario' end as tipo
  from casa_morador m
  left join auth.users u on u.id = m.user_id
  where m.casa_id = p_casa_id
    and m.ativo
  order by m.criado_em;
$$;

revoke execute on function public.casa_moradores(uuid) from public, anon;
grant execute on function public.casa_moradores(uuid) to authenticated;