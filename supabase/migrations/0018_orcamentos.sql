-- ============================================================
-- Comorar — orçamento por categoria (backend)
-- Tabela orcamentos + RLS + consulta de uso + notificação de estouro
-- Frontend (CRUD/progresso) será construído após o redesign.
-- ============================================================

create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas(id) on delete cascade,
  categoria text not null default 'Geral',
  mes text not null,
  limite numeric not null check (limite > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (casa_id, categoria, mes)
);

create table public.orcamento_ajustes (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  ajustado_em timestamptz not null default now()
);

alter table public.orcamentos enable row level security;
alter table public.orcamento_ajustes enable row level security;

create policy orcamentos_select on public.orcamentos
  for select to authenticated
  using (public.is_casa_member(casa_id));

create policy orcamentos_insert on public.orcamentos
  for insert to authenticated
  with check (public.is_casa_member(casa_id));

create policy orcamentos_update on public.orcamentos
  for update to authenticated
  using (public.is_casa_member(casa_id))
  with check (public.is_casa_member(casa_id));

create policy orcamentos_delete on public.orcamentos
  for delete to authenticated
  using (public.is_casa_member(casa_id));

-- gatilho: manter atualizado_em salvo (evita gravidade do trigger de notificação re-marcar)
create or replace function public.trg_orcamento_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger trg_orcamento_touch before update on public.orcamentos
  for each row execute function public.trg_orcamento_touch();

revoke execute on function public.trg_orcamento_touch() from public, anon, authenticated;

-- ---------- consulta: uso vs limite por categoria ----------

create or replace function public.orcamento_uso(p_casa uuid, p_mes text default to_char(current_date, 'YYYY-MM'))
returns table (
  categoria text,
  limite numeric,
  usado numeric,
  restante numeric,
  pct numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_casa_member(p_casa) then
    return;
  end if;

  return query
    select o.categoria,
           o.limite,
           coalesce(round(sum(d.valor), 2), 0),
           round(o.limite - coalesce(sum(d.valor), 0), 2),
           round((coalesce(sum(d.valor), 0) / nullif(o.limite, 0)) * 100, 1)
    from public.orcamentos o
    left join public.despesas d
      on d.casa_id = o.casa_id
     and d.status = 'confirmada'
     and to_char(d.data, 'YYYY-MM') = p_mes
     and coalesce(d.categoria, 'Geral') = o.categoria
    where o.casa_id = p_casa
      and o.mes = p_mes
    group by o.categoria, o.limite
    order by o.categoria;
end;
$$;

revoke execute on function public.orcamento_uso(uuid, text) from public, anon;
grant execute on function public.orcamento_uso(uuid, text) to authenticated;
grant execute on function public.orcamento_uso(uuid, text) to service_role;

-- ---------- notificação quando o limite é estourado ----------

create or replace function public.trg_orcamento_excedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat text;
  v_mes text;
  v_limite numeric;
  v_usado numeric;
  v_uid uuid;
begin
  if new.status <> 'confirmada' or new.casa_id is null or new.data is null then
    return new;
  end if;

  v_cat := coalesce(new.categoria, 'Geral');
  v_mes := to_char(new.data, 'YYYY-MM');

  select o.limite into v_limite
  from public.orcamentos o
  where o.casa_id = new.casa_id
    and o.mes = v_mes
    and o.categoria = v_cat;

  if not found then
    return new;
  end if;

  select sum(d.valor) into v_usado
  from public.despesas d
  where d.casa_id = new.casa_id
    and d.status = 'confirmada'
    and to_char(d.data, 'YYYY-MM') = v_mes
    and coalesce(d.categoria, 'Geral') = v_cat;

  if v_usado is null or v_usado <= v_limite then
    return new;
  end if;

  for v_uid in
    select m.user_id
    from public.casa_morador m
    where m.casa_id = new.casa_id and m.user_id is not null and m.ativo
  loop
    perform public.notificar_usuario(
      v_uid,
      'orcamento_excedido',
      'Orçamento excedido',
      format('Categoria "%s": R$ %s de um limite de R$ %s (%.0f%%).', v_cat, round(v_usado, 2), v_limite, round((v_usado / v_limite) * 100, 0)),
      '/balanco'
    );
  end loop;

  return new;
end;
$$;

create trigger trg_orcamento_excedido
after insert or update of valor, status, categoria, data on public.despesas
for each row execute function public.trg_orcamento_excedido();

revoke execute on function public.trg_orcamento_excedido() from public, anon, authenticated;

-- Já existem orçamentos criados? não — tabela nova, nada a migrar.