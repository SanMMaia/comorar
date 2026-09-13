-- ============================================================
-- Comorar — schema inicial
-- ============================================================

create extension if not exists "pgcrypto";

create type public.categoria as enum ('aluguel', 'luz', 'agua', 'internet', 'mercado', 'outro');
create type public.tipo_rateio as enum ('igual', 'percentual', 'consumo');
create type public.status_despesa as enum ('prevista', 'confirmada', 'cancelada');
create type public.intervalo_recorrencia as enum ('mensal', 'semanal', 'quinzenal', 'anual');

-- ---------- casas ----------

create table public.casas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo_convite text not null unique,
  criado_em timestamptz not null default now()
);

-- ---------- casa_morador ----------

create table public.casa_morador (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (casa_id, user_id)
);

create index on public.casa_morador (user_id);
create index on public.casa_morador (casa_id);

-- ---------- regras_rateio (percentual fixo por casa) ----------

create table public.regras_rateio (
  casa_id uuid not null references public.casas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  percentual numeric(5,2) not null check (percentual >= 0 and percentual <= 100),
  primary key (casa_id, user_id)
);

-- ---------- recorrencias ----------

create table public.recorrencias (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas(id) on delete cascade,
  fornecedor text not null,
  descricao text,
  categoria public.categoria not null,
  valor_previsto numeric(12,2) not null check (valor_previsto > 0),
  data_inicio date not null,
  dia_vencimento int check (dia_vencimento between 1 and 31),
  intervalo public.intervalo_recorrencia not null default 'mensal',
  tipo_rateio public.tipo_rateio not null default 'igual',
  pagador_padrao uuid references auth.users(id) on delete set null,
  rotativo boolean not null default false,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create index on public.recorrencias (casa_id);

-- ---------- despesas ----------

create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas(id) on delete cascade,
  fornecedor text not null,
  descricao text,
  valor numeric(12,2) not null check (valor > 0),
  categoria public.categoria not null default 'outro',
  pago_por uuid references auth.users(id),
  tipo_rateio public.tipo_rateio not null default 'igual',
  status public.status_despesa not null default 'confirmada',
  origem_recorrencia_id uuid references public.recorrencias(id) on delete set null,
  data date not null,
  comprovante_url text,
  ocr_resultado jsonb,
  criado_em timestamptz not null default now()
);

create index on public.despesas (casa_id, data);

-- ---------- rateios ----------

create table public.rateios (
  id uuid primary key default gen_random_uuid(),
  despesa_id uuid not null references public.despesas(id) on delete cascade,
  morador_id uuid not null references auth.users(id) on delete cascade,
  valor_rateado numeric(12,2) not null check (valor_rateado > 0),
  pago boolean not null default false,
  pago_em timestamptz,
  confirmado_por uuid references auth.users(id),
  unique (despesa_id, morador_id)
);

create index on public.rateios (despesa_id);
create index on public.rateios (morador_id);

-- ---------- helpers de autorização (usados pelas policies) ----------

create function public.is_casa_member(p_casa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from casa_morador m
    where m.casa_id = p_casa_id
      and m.user_id = auth.uid()
      and m.ativo
  );
$$;

create function public.is_casa_owner(p_casa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from casa_morador m
    where m.casa_id = p_casa_id
      and m.user_id = auth.uid()
      and m.ativo
      and m.role = 'owner'
  );
$$;

-- ---------- RLS ----------

alter table public.casas enable row level security;
alter table public.casa_morador enable row level security;
alter table public.regras_rateio enable row level security;
alter table public.recorrencias enable row level security;
alter table public.despesas enable row level security;
alter table public.rateios enable row level security;

-- casas
create policy casas_select on public.casas
  for select to authenticated
  using (public.is_casa_member(id));

create policy casas_insert on public.casas
  for insert to authenticated
  with check (true);

create policy casas_update on public.casas
  for update to authenticated
  using (public.is_casa_owner(id))
  with check (public.is_casa_owner(id));

-- casa_morador: sem insert direto (somente via RPC join_casa/create_casa)
create policy casa_morador_select on public.casa_morador
  for select to authenticated
  using (public.is_casa_member(casa_id));

-- regras_rateio
create policy regras_rateio_select on public.regras_rateio
  for select to authenticated
  using (public.is_casa_member(casa_id));

create policy regras_rateio_write on public.regras_rateio
  for all to authenticated
  using (public.is_casa_owner(casa_id))
  with check (public.is_casa_owner(casa_id));

-- recorrencias
create policy recorrencias_select on public.recorrencias
  for select to authenticated
  using (public.is_casa_member(casa_id));

create policy recorrencias_insert on public.recorrencias
  for insert to authenticated
  with check (public.is_casa_member(casa_id));

create policy recorrencias_update on public.recorrencias
  for update to authenticated
  using (public.is_casa_member(casa_id))
  with check (public.is_casa_member(casa_id));

create policy recorrencias_delete on public.recorrencias
  for delete to authenticated
  using (public.is_casa_owner(casa_id));

-- despesas
create policy despesas_select on public.despesas
  for select to authenticated
  using (public.is_casa_member(casa_id));

create policy despesas_insert on public.despesas
  for insert to authenticated
  with check (public.is_casa_member(casa_id));

create policy despesas_update on public.despesas
  for update to authenticated
  using (public.is_casa_member(casa_id))
  with check (public.is_casa_member(casa_id));

create policy despesas_delete on public.despesas
  for delete to authenticated
  using (public.is_casa_owner(casa_id));

-- rateios
create policy rateios_select on public.rateios
  for select to authenticated
  using (
    exists (
      select 1 from public.despesas d
      where d.id = rateios.despesa_id
        and public.is_casa_member(d.casa_id)
    )
  );

create policy rateios_insert on public.rateios
  for insert to authenticated
  with check (
    exists (
      select 1 from public.despesas d
      where d.id = rateios.despesa_id
        and public.is_casa_member(d.casa_id)
    )
  );

create policy rateios_update on public.rateios
  for update to authenticated
  using (
    exists (
      select 1 from public.despesas d
      where d.id = rateios.despesa_id
        and public.is_casa_member(d.casa_id)
    )
  );

create policy rateios_delete on public.rateios
  for delete to authenticated
  using (
    exists (
      select 1 from public.despesas d
      where d.id = rateios.despesa_id
        and public.is_casa_member(d.casa_id)
    )
  );

-- ---------- RPCs ----------

-- Cria a casa e o usuário como owner, em uma transação.
create function public.create_casa(p_nome text)
returns public.casas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_casa public.casas;
  v_codigo text;
begin
  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.casas (nome, codigo_convite)
    values (p_nome, v_codigo)
    returning * into v_casa;

  insert into public.casa_morador (casa_id, user_id, role)
    values (v_casa.id, auth.uid(), 'owner');

  return v_casa;
end;
$$;

-- Entra numa casa existente usando o código de convite.
create function public.join_casa(p_codigo text)
returns public.casas
language plpgsql
security definer
set search_path = public
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
    on conflict (casa_id, user_id)
    do update set ativo = true;

  return v_casa;
end;
$$;