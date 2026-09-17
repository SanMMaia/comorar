-- ============================================================
-- Comorar — visibilidade por papel
-- Responsável (owner) vê tudo. Morador vê:
--   * todas as previstas da casa (para Pagar/Ignorar);
--   * despesas confirmadas/canceladas em que participa do rateio;
--   * apenas o próprio rateio (não os rateios de terceiros);
--   * quem pagou cada despesa (coluna despesas.pago_por).
-- ============================================================

-- ---------- helpers (SECURITY DEFINER: não disparam RLS) ----------

-- casa_morador.id do usuário autenticado numa casa
create or replace function public.meu_morador_id(p_casa_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.casa_morador m
  where m.casa_id = p_casa_id
    and m.user_id = auth.uid()
    and m.ativo
  limit 1;
$$;

-- casa_morador.id do usuário autenticado na casa da despesa
create or replace function public.meu_morador_da_despesa(p_despesa_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.despesas d
  join public.casa_morador m on m.casa_id = d.casa_id
  where d.id = p_despesa_id
    and m.user_id = auth.uid()
    and m.ativo
  limit 1;
$$;

-- o usuário autenticado é owner da casa da despesa?
create or replace function public.sou_owner_da_despesa(p_despesa_id uuid)
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
      and m.role = 'owner'
  );
$$;

-- o usuário autenticado participa do rateio da despesa?
create or replace function public.participa_despesa(p_despesa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rateios r
    where r.despesa_id = p_despesa_id
      and r.morador_id = public.meu_morador_da_despesa(p_despesa_id)
  );
$$;

-- ---------- RLS: despesas ----------

drop policy if exists despesas_select on public.despesas;
create policy despesas_select on public.despesas
  for select to authenticated
  using (
    public.is_casa_owner(casa_id)
    or (
      public.is_casa_member(casa_id)
      and (status = 'prevista' or public.participa_despesa(id))
    )
  );

-- ---------- RLS: rateios ----------

drop policy if exists rateios_select on public.rateios;
create policy rateios_select on public.rateios
  for select to authenticated
  using (
    public.sou_owner_da_despesa(despesa_id)
    or morador_id = public.meu_morador_da_despesa(despesa_id)
  );

-- ---------- RPC: saldo pessoal (devo / me devem) ----------
-- Não expõe o rateio de terceiros: devolve apenas os totais que envolvem
-- o usuário autenticado, por contraparte e, opcionalmente, por mês.

drop function if exists public.meu_saldo(uuid, text);
create function public.meu_saldo(p_casa uuid, p_mes text default null)
returns table (direcao text, contraparte_id uuid, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (
    select public.meu_morador_id(p_casa) as id
  ),
  devo as (
    select d.pago_por as contraparte_id, sum(r.valor_rateado) as valor
    from public.rateios r
    join public.despesas d on d.id = r.despesa_id
    where d.casa_id = p_casa
      and d.status = 'confirmada'
      and r.morador_id = (select id from eu)
      and not r.pago
      and d.pago_por is not null
      and (p_mes is null or to_char(d.data, 'YYYY-MM') = p_mes)
    group by d.pago_por
  ),
  me_devem as (
    select r.morador_id as contraparte_id, sum(r.valor_rateado) as valor
    from public.rateios r
    join public.despesas d on d.id = r.despesa_id
    where d.casa_id = p_casa
      and d.status = 'confirmada'
      and d.pago_por = (select id from eu)
      and not r.pago
      and r.morador_id <> (select id from eu)
      and (p_mes is null or to_char(d.data, 'YYYY-MM') = p_mes)
    group by r.morador_id
  )
  select 'devo'::text, contraparte_id, valor from devo
  union all
  select 'me_devem'::text, contraparte_id, valor from me_devem;
$$;

revoke execute on function public.meu_saldo(uuid, text) from public, anon;
grant execute on function public.meu_saldo(uuid, text) to authenticated;
