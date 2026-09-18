-- Comorar — features v2: mercado (10.4), ajustes e caixinhas (10.5),
-- despesa parcelada (10.10) e leitura de medidor (10.11)

-- ---------------------------------------------------------------
-- 1) despesas: flags de mercado / parcelada
-- ---------------------------------------------------------------
alter table public.despesas add column mercado boolean not null default false;
alter table public.despesas add column parcelada boolean not null default false;
alter table public.despesas add column total_parcelas int check (total_parcelas is null or total_parcelas >= 2);

-- ---------------------------------------------------------------
-- 2) 10.4 itens_despesa (mercado com itens)
-- donos = casa_morador.id[]; vazio = item comum (dividido entre todos)
-- ---------------------------------------------------------------
create table public.itens_despesa (
  id uuid primary key default gen_random_uuid(),
  despesa_id uuid not null references public.despesas(id) on delete cascade,
  descricao text not null,
  valor numeric(12,2) not null check (valor > 0),
  donos uuid[] not null default '{}',
  criado_em timestamptz not null default now()
);
create index on public.itens_despesa (despesa_id);
alter table public.itens_despesa enable row level security;

create policy itens_despesa_select on public.itens_despesa
  for select to authenticated
  using (exists (
    select 1 from public.despesas d
    where d.id = itens_despesa.despesa_id and public.is_casa_member(d.casa_id)
  ));

create policy itens_despesa_insert on public.itens_despesa
  for insert to authenticated
  with check (exists (
    select 1 from public.despesas d
    where d.id = itens_despesa.despesa_id and public.is_casa_member(d.casa_id)
  ));

create policy itens_despesa_update on public.itens_despesa
  for update to authenticated
  using (exists (
    select 1 from public.despesas d
    where d.id = itens_despesa.despesa_id and public.is_casa_member(d.casa_id)
  ));

create policy itens_despesa_delete on public.itens_despesa
  for delete to authenticated
  using (exists (
    select 1 from public.despesas d
    where d.id = itens_despesa.despesa_id and public.is_casa_member(d.casa_id)
  ));

-- ---------------------------------------------------------------
-- 3) 10.10 parcelas (despesa parcelada)
-- a despesa mãe guarda o total e o rateio; parcelas rastreiam o cronograma
-- ---------------------------------------------------------------
create table public.parcelas (
  id uuid primary key default gen_random_uuid(),
  despesa_id uuid not null references public.despesas(id) on delete cascade,
  numero int not null check (numero >= 1),
  valor numeric(12,2) not null check (valor > 0),
  data_vencimento date not null,
  paga boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (despesa_id, numero)
);
create index on public.parcelas (despesa_id);
alter table public.parcelas enable row level security;

create policy parcelas_select on public.parcelas
  for select to authenticated
  using (exists (
    select 1 from public.despesas d
    where d.id = parcelas.despesa_id and public.is_casa_member(d.casa_id)
  ));

create policy parcelas_insert on public.parcelas
  for insert to authenticated
  with check (exists (
    select 1 from public.despesas d
    where d.id = parcelas.despesa_id and public.is_casa_member(d.casa_id)
  ));

create policy parcelas_update on public.parcelas
  for update to authenticated
  using (exists (
    select 1 from public.despesas d
    where d.id = parcelas.despesa_id and public.is_casa_member(d.casa_id)
  ));

create policy parcelas_delete on public.parcelas
  for delete to authenticated
  using (exists (
    select 1 from public.despesas d
    where d.id = parcelas.despesa_id and public.is_casa_member(d.casa_id)
  ));

-- ---------------------------------------------------------------
-- 4) 10.5 ajustes (IOU)
-- ---------------------------------------------------------------
create table public.ajustes (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas(id) on delete cascade,
  de_morador uuid not null references public.casa_morador(id) on delete cascade,
  para_morador uuid not null references public.casa_morador(id) on delete cascade,
  valor numeric(12,2) not null check (valor > 0),
  motivo text,
  data date not null default current_date,
  pago boolean not null default false,
  pago_em timestamptz,
  confirmado_por uuid references auth.users(id),
  cancelado boolean not null default false,
  criado_em timestamptz not null default now()
);
create index on public.ajustes (casa_id);
create index on public.ajustes (de_morador);
create index on public.ajustes (para_morador);
alter table public.ajustes enable row level security;

create policy ajustes_select on public.ajustes
  for select to authenticated
  using (public.is_casa_member(casa_id));

create policy ajustes_insert on public.ajustes
  for insert to authenticated
  with check (
    public.is_casa_member(casa_id)
    and exists (select 1 from public.casa_morador m1 where m1.id = de_morador and m1.casa_id = casa_id)
    and exists (select 1 from public.casa_morador m2 where m2.id = para_morador and m2.casa_id = casa_id)
  );

-- update aberto para moradores da casa; quem anula é o credor (regra de produto no app)
create policy ajustes_update on public.ajustes
  for update to authenticated
  using (public.is_casa_member(casa_id))
  with check (public.is_casa_member(casa_id));

create policy ajustes_delete on public.ajustes
  for delete to authenticated
  using (public.is_casa_owner(casa_id));

-- ---------------------------------------------------------------
-- 5) 10.5 caixinhas (conta conjunta) + movimentos
-- ---------------------------------------------------------------
create table public.caixinhas (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas(id) on delete cascade,
  nome text not null,
  saldo numeric(12,2) not null default 0,
  regra text not null default 'igual' check (regra in ('igual', 'percentual')),
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);
create index on public.caixinhas (casa_id);
alter table public.caixinhas enable row level security;

create policy caixinhas_select on public.caixinhas
  for select to authenticated
  using (public.is_casa_member(casa_id));

create policy caixinhas_insert on public.caixinhas
  for insert to authenticated
  with check (public.is_casa_owner(casa_id));

create policy caixinhas_update on public.caixinhas
  for update to authenticated
  using (public.is_casa_owner(casa_id))
  with check (public.is_casa_owner(casa_id));

create policy caixinhas_delete on public.caixinhas
  for delete to authenticated
  using (public.is_casa_owner(casa_id));

create table public.movimentos_caixinha (
  id uuid primary key default gen_random_uuid(),
  caixinha_id uuid not null references public.caixinhas(id) on delete cascade,
  morador_id uuid not null references public.casa_morador(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  valor numeric(12,2) not null check (valor > 0),
  descricao text,
  data date not null default current_date,
  criado_em timestamptz not null default now()
);
create index on public.movimentos_caixinha (caixinha_id);
create index on public.movimentos_caixinha (morador_id);
alter table public.movimentos_caixinha enable row level security;

create policy movimentos_caixinha_select on public.movimentos_caixinha
  for select to authenticated
  using (exists (
    select 1 from public.caixinhas c
    where c.id = movimentos_caixinha.caixinha_id and public.is_casa_member(c.casa_id)
  ));

create policy movimentos_caixinha_insert on public.movimentos_caixinha
  for insert to authenticated
  with check (exists (
    select 1 from public.caixinhas c
    where c.id = movimentos_caixinha.caixinha_id
      and public.is_casa_member(c.casa_id)
      and c.ativa
  ));

create policy movimentos_caixinha_update on public.movimentos_caixinha
  for update to authenticated
  using (exists (
    select 1 from public.caixinhas c
    where c.id = movimentos_caixinha.caixinha_id and public.is_casa_member(c.casa_id)
  ));

create policy movimentos_caixinha_delete on public.movimentos_caixinha
  for delete to authenticated
  using (exists (
    select 1 from public.caixinhas c
    where c.id = movimentos_caixinha.caixinha_id and public.is_casa_owner(c.casa_id)
  ));

-- mantém o saldo da caixinha sincronizado com os movimentos
create or replace function public.atualizar_saldo_caixinha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caixinha uuid;
begin
  if tg_op = 'DELETE' then
    v_caixinha := old.caixinha_id;
  else
    v_caixinha := new.caixinha_id;
  end if;
  update public.caixinhas c
    set saldo = coalesce((
      select round(sum(case when m.tipo = 'entrada' then m.valor else -m.valor end), 2)
      from public.movimentos_caixinha m
      where m.caixinha_id = v_caixinha
    ), 0)
    where c.id = v_caixinha;
  return coalesce(new, old);
end;
$$;

create trigger trg_movimentos_ajusta_saldo
  after insert or update or delete on public.movimentos_caixinha
  for each row execute function public.atualizar_saldo_caixinha();

-- ---------------------------------------------------------------
-- 6) 10.11 leituras_medidor (água/luz)
-- ---------------------------------------------------------------
create table public.leituras_medidor (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas(id) on delete cascade,
  tipo text not null check (tipo in ('agua', 'luz')),
  morador_id uuid not null references public.casa_morador(id) on delete cascade,
  leitura numeric(12,1) not null check (leitura >= 0),
  data_leitura date not null,
  criado_em timestamptz not null default now()
);
create index on public.leituras_medidor (casa_id, tipo, data_leitura);
create index on public.leituras_medidor (morador_id);
alter table public.leituras_medidor enable row level security;

create policy leituras_medidor_select on public.leituras_medidor
  for select to authenticated
  using (public.is_casa_member(casa_id));

create policy leituras_medidor_insert on public.leituras_medidor
  for insert to authenticated
  with check (
    public.is_casa_member(casa_id)
    and exists (select 1 from public.casa_morador m where m.id = morador_id and m.casa_id = casa_id)
  );

create policy leituras_medidor_update on public.leituras_medidor
  for update to authenticated
  using (public.is_casa_member(casa_id))
  with check (public.is_casa_member(casa_id));

create policy leituras_medidor_delete on public.leituras_medidor
  for delete to authenticated
  using (public.is_casa_owner(casa_id));

-- ---------------------------------------------------------------
-- 7) meu_saldo passou a incluir ajustes (IOU)
-- ---------------------------------------------------------------
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

create or replace function public.meu_saldo(p_casa uuid, p_mes text default null)
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
  devo_aj as (
    select a.para_morador as contraparte_id, sum(a.valor) as valor
    from public.ajustes a
    where a.casa_id = p_casa
      and a.de_morador = (select id from eu)
      and not a.pago
      and not a.cancelado
      and (p_mes is null or to_char(a.data, 'YYYY-MM') = p_mes)
    group by a.para_morador
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
  ),
  me_devem_aj as (
    select a.de_morador as contraparte_id, sum(a.valor) as valor
    from public.ajustes a
    where a.casa_id = p_casa
      and a.para_morador = (select id from eu)
      and not a.pago
      and not a.cancelado
      and a.de_morador <> (select id from eu)
      and (p_mes is null or to_char(a.data, 'YYYY-MM') = p_mes)
    group by a.de_morador
  )
  select 'devo'::text, contraparte_id, valor from devo
  union all
  select 'devo'::text, contraparte_id, valor from devo_aj
  union all
  select 'me_devem'::text, contraparte_id, valor from me_devem
  union all
  select 'me_devem'::text, contraparte_id, valor from me_devem_aj;
$$;

revoke execute on function public.meu_saldo(uuid, text) from public, anon;
grant execute on function public.meu_saldo(uuid, text) to authenticated;
revoke execute on function public.meu_morador_id(uuid) from public, anon;
grant execute on function public.meu_morador_id(uuid) to authenticated;