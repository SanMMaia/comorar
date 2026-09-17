-- ============================================================
-- Comorar — comparação mês a mês (resumo mensal read-only)
-- EXPOSED via /rest/v1/rpc/resumo_mensal, apenas membros da casa
-- ============================================================

create or replace function public.resumo_mensal(p_casa uuid, p_meses int default 6)
returns table (
  mes text,
  total_confirmado numeric,
  total_previsto numeric,
  num_confirmadas bigint,
  num_previstas bigint,
  por_categoria jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes text;
  v_inicio date;
  v_total_confirmado numeric := 0;
  v_total_previsto numeric := 0;
  v_num_confirmadas bigint := 0;
  v_num_previstas bigint := 0;
  v_por jsonb := '{}'::jsonb;
begin
  if not exists (
    select 1 from public.casa_morador m
    where m.casa_id = p_casa and m.user_id = auth.uid() and m.ativo
  ) then
    return;
  end if;

  p_meses := greatest(1, least(p_meses, 24));
  v_inicio := (date_trunc('month', current_date)::date - ((p_meses - 1)::text || ' months')::interval);

  for v_mes in
    select to_char(gs, 'YYYY-MM')
    from generate_series(v_inicio, current_date, '1 month') gs
  loop
    select
      coalesce(sum(d.valor) filter (where d.status = 'confirmada'), 0),
      coalesce(sum(d.valor) filter (where d.status = 'prevista'), 0),
      count(*) filter (where d.status = 'confirmada'),
      count(*) filter (where d.status = 'prevista')
    into v_total_confirmado, v_total_previsto, v_num_confirmadas, v_num_previstas
    from public.despesas d
    where d.casa_id = p_casa
      and to_char(d.data, 'YYYY-MM') = v_mes;

    select coalesce(jsonb_object_agg(coalesce(cat, 'Sem categoria'), tot), '{}'::jsonb)
    into v_por
    from (
      select d.categoria as cat, sum(d.valor) as tot
      from public.despesas d
      where d.casa_id = p_casa
        and to_char(d.data, 'YYYY-MM') = v_mes
        and d.status = 'confirmada'
      group by d.categoria
    ) s;

    mes := v_mes;
    total_confirmado := v_total_confirmado;
    total_previsto := v_total_previsto;
    num_confirmadas := v_num_confirmadas;
    num_previstas := v_num_previstas;
    por_categoria := v_por;
    return next;
  end loop;
end;
$$;

revoke execute on function public.resumo_mensal(uuid, int) from public, anon;
grant execute on function public.resumo_mensal(uuid, int) to authenticated;
grant execute on function public.resumo_mensal(uuid, int) to service_role;