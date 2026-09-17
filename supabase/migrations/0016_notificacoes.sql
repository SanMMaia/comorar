-- ============================================================
-- Comorar — notificações in-app + preferências por usuário
-- ============================================================

-- ---------- tabelas ----------

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  corpo text not null,
  link_destino text not null,
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);

create index notificacoes_user_lida_idx
  on public.notificacoes (user_id, lida, criado_em desc);

create table public.preferencias_notificacao (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ativo boolean not null default true,
  dias_antecedencia integer not null default 3 check (dias_antecedencia between 1 and 14),
  canais text[] not null default '{inbox}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- RLS ----------

alter table public.notificacoes enable row level security;
alter table public.preferencias_notificacao enable row level security;

-- usuário vê e marca como lida apenas as próprias notificações
create policy notificacoes_select on public.notificacoes
  for select to authenticated
  using (user_id = auth.uid());

create policy notificacoes_update on public.notificacoes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- preferências: leitura, criação e atualização só da própria linha
create policy preferencias_select on public.preferencias_notificacao
  for select to authenticated
  using (user_id = auth.uid());

create policy preferencias_insert on public.preferencias_notificacao
  for insert to authenticated
  with check (user_id = auth.uid());

create policy preferencias_update on public.preferencias_notificacao
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- expõe a tabela ao Realtime (badge do sino atualiza ao vivo)
do language plpgsql $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notificacoes'
     ) then
    execute 'alter publication supabase_realtime add table public.notificacoes';
  end if;
end $$;

-- ---------- helper de notificação (respeita preferência e evita duplicados) ----------

create or replace function public.notificar_usuario(
  p_user uuid,
  p_tipo text,
  p_titulo text,
  p_corpo text,
  p_link text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pref record;
  v_inbox boolean := true;
  v_emails text[] := array['inbox'];
begin
  if p_user is null then
    return;
  end if;

  select p.ativo, p.canais into v_pref
  from public.preferencias_notificacao p
  where p.user_id = p_user;

  -- sem preferência registrada = usa o padrão (inbox ativo)
  if v_pref.ativo is not null and not v_pref.ativo then
    return;
  end if;
  if v_pref.canais is not null then
    v_emails := v_pref.canais;
  end if;
  v_inbox := v_emails @> array['inbox'];

  if not v_inbox then
    return;
  end if;

  -- evita duplicar a mesma notificação (mesmo tipo + mesmo destino)
  if exists (
    select 1 from public.notificacoes n
    where n.user_id = p_user
      and n.tipo = p_tipo
      and n.link_destino = p_link
  ) then
    return;
  end if;

  insert into public.notificacoes (user_id, tipo, titulo, corpo, link_destino)
  values (p_user, p_tipo, p_titulo, p_corpo, p_link);
end;
$$;

revoke execute on function public.notificar_usuario(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------- trigger: rateio criado contra o morador ----------

create or replace function public.trg_rateio_criado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_despesa public.despesas%rowtype;
  v_morador public.casa_morador%rowtype;
  v_pagador public.casa_morador%rowtype;
  v_pagador_nome text;
  v_valor text;
begin
  if new.pago then
    return new;
  end if;

  select * into v_despesa from public.despesas d where d.id = new.despesa_id;
  if not found or v_despesa.pago_por is null then
    return new;
  end if;

  -- morador que passou a dever
  select * into v_morador from public.casa_morador m where m.id = new.morador_id;
  if not found or v_morador.user_id is null then
    return new;
  end if;

  -- não notifica o próprio pagador
  if new.morador_id = v_despesa.pago_por then
    return new;
  end if;

  select * into v_pagador from public.casa_morador m where m.id = v_despesa.pago_por;
  select coalesce(
           u.raw_user_meta_data->>'full_name',
           u.raw_user_meta_data->>'name',
           split_part(u.email, '@', 1)
         ) into v_pagador_nome
  from auth.users u where u.id = v_pagador.user_id;

  v_valor := replace(to_char(round(new.valor_rateado, 2), 'FM999999999999.00'), '.', ',');

  perform public.notificar_usuario(
    v_morador.user_id,
    'rateio_criado',
    'Nova cobrança',
    format('%s lançou "%s" — você deve R$ %s', v_pagador_nome, v_despesa.fornecedor, v_valor),
    '/despesa/' || new.despesa_id::text
  );

  return new;
end;
$$;

create trigger trg_rateio_criado
after insert on public.rateios
for each row execute function public.trg_rateio_criado();

revoke execute on function public.trg_rateio_criado() from public, anon, authenticated;

-- ---------- trigger: pagamento confirmado ----------

create or replace function public.trg_rateio_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_despesa public.despesas%rowtype;
  v_morador public.casa_morador%rowtype;
  v_pagador public.casa_morador%rowtype;
  v_pagador_user uuid;
  v_morador_nome text;
  v_valor text;
begin
  if old.pago = new.pago or not new.pago then
    return new;
  end if;

  select * into v_despesa from public.despesas d where d.id = new.despesa_id;
  if not found or v_despesa.pago_por is null then
    return new;
  end if;

  -- o próprio pagador não se auto-notifica (nem quando marca por conta própria)
  if new.morador_id = v_despesa.pago_por then
    return new;
  end if;

  select * into v_pagador from public.casa_morador m where m.id = v_despesa.pago_por;
  v_pagador_user := v_pagador.user_id;
  if v_pagador_user is null then
    return new;
  end if;

  -- quem confirmou é o próprio pagador → sem notificação
  if new.confirmado_por = v_pagador_user then
    return new;
  end if;

  select * into v_morador from public.casa_morador m where m.id = new.morador_id;
  select coalesce(
           u.raw_user_meta_data->>'full_name',
           u.raw_user_meta_data->>'name',
           split_part(u.email, '@', 1)
         ) into v_morador_nome
  from auth.users u
  where u.id = v_morador.user_id
  union all
  select v_morador.nome
  where v_morador.user_id is null and v_morador.nome is not null
  limit 1;

  v_valor := replace(to_char(round(new.valor_rateado, 2), 'FM999999999999.00'), '.', ',');

  perform public.notificar_usuario(
    v_pagador_user,
    'pagamento_confirmado',
    'Pagamento recebido',
    format('%s pagou R$ %s de "%s"', v_morador_nome, v_valor, v_despesa.fornecedor),
    '/despesa/' || new.despesa_id::text
  );

  return new;
end;
$$;

create trigger trg_rateio_pago
after update of pago on public.rateios
for each row execute function public.trg_rateio_pago();

revoke execute on function public.trg_rateio_pago() from public, anon, authenticated;

-- ---------- rotina diária: lembrete de vencimento ----------

create or replace function public.gerar_lembretes_vencimento()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro record;
  v_prev record;
  v_dias integer;
  v_corpo text;
  v_valor text;
begin
  for v_membro in
    select m.user_id, m.casa_id
    from public.casa_morador m
    where m.user_id is not null and m.ativo
  loop
    v_dias := 3;
    select p.dias_antecedencia into v_dias
    from public.preferencias_notificacao p
    where p.user_id = v_membro.user_id;
    if v_dias is null then
      v_dias := 3;
    end if;

    for v_prev in
      select d.id, d.fornecedor, d.valor, d.data
      from public.despesas d
      where d.casa_id = v_membro.casa_id
        and d.status = 'prevista'
        and d.data between current_date and current_date + v_dias
    loop
      v_valor := replace(to_char(round(v_prev.valor, 2), 'FM999999999999.00'), '.', ',');
      v_corpo := format('"%s" vence em %s dia(s) — R$ %s',
                        v_prev.fornecedor,
                        (v_prev.data - current_date)::int,
                        v_valor);

      perform public.notificar_usuario(
        v_membro.user_id,
        'vencimento_proximo',
        'Conta a vencer',
        v_corpo,
        '/despesa/' || v_prev.id::text
      );
    end loop;
  end loop;
end;
$$;

revoke execute on function public.gerar_lembretes_vencimento() from public, anon, authenticated;
grant execute on function public.gerar_lembretes_vencimento() to service_role;

-- executa uma vez agora e agenda diariamente às 04:00
select public.gerar_lembretes_vencimento();
select cron.schedule('comorar-lembrar-vencimentos', '0 4 * * *', 'select public.gerar_lembretes_vencimento();');