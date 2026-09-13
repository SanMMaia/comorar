-- ============================================================
-- Comorar — geração automática de previstas (+12 meses)
-- ============================================================

create extension if not exists pg_cron;

create unique index if not exists despesas_recorrencia_data_uniq
  on public.despesas (origem_recorrencia_id, data)
  where origem_recorrencia_id is not null;

create or replace function public.gerar_previstas_pendentes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recorrencias%rowtype;
  d date;
  i int;
  dia int;
  n_meses int := 12;
  ultimo_dia date;
begin
  for r in
    select * from public.recorrencias where ativa order by id
  loop
    if r.intervalo = 'semanal' or r.intervalo = 'quinzenal' then
      d := r.data_inicio;
      while d <= current_date + interval '12 months' loop
        if d >= current_date then
          insert into public.despesas
            (casa_id, fornecedor, descricao, valor, categoria, tipo_rateio, status, origem_recorrencia_id, data)
          values
            (r.casa_id, r.fornecedor, r.descricao, r.valor_previsto, r.categoria, r.tipo_rateio, 'prevista', r.id, d)
          on conflict (origem_recorrencia_id, data) where origem_recorrencia_id is not null do nothing;
        end if;
        d := d + (case when r.intervalo = 'semanal' then 7 else 14 end);
      end loop;
    elsif r.intervalo = 'anual' then
      d := r.data_inicio;
      for i in 0..n_meses - 1 loop
        if d >= current_date then
          insert into public.despesas
            (casa_id, fornecedor, descricao, valor, categoria, tipo_rateio, status, origem_recorrencia_id, data)
          values
            (r.casa_id, r.fornecedor, r.descricao, r.valor_previsto, r.categoria, r.tipo_rateio, 'prevista', r.id, d)
          on conflict (origem_recorrencia_id, data) where origem_recorrencia_id is not null do nothing;
        end if;
        d := d + interval '1 year';
      end loop;
    else
      dia := coalesce(r.dia_vencimento, extract(day from r.data_inicio)::int);
      for i in 0..n_meses - 1 loop
        d := (current_date + (i * interval '1 month'))::date;
        ultimo_dia := (date_trunc('month', d) + interval '1 month' - interval '1 day')::date;
        d := d + (least(dia, extract(day from ultimo_dia)::int) - extract(day from d)::int);
        if d >= current_date then
          insert into public.despesas
            (casa_id, fornecedor, descricao, valor, categoria, tipo_rateio, status, origem_recorrencia_id, data)
          values
            (r.casa_id, r.fornecedor, r.descricao, r.valor_previsto, r.categoria, r.tipo_rateio, 'prevista', r.id, d)
          on conflict (origem_recorrencia_id, data) where origem_recorrencia_id is not null do nothing;
        end if;
      end loop;
    end if;
  end loop;
end;
$$;

-- executa uma vez agora para já existirem previstas
select public.gerar_previstas_pendentes();

-- rotina diária às 03:00 (garante horizonte de +12 meses sempre)
select cron.schedule('comorar-gerar-previstas', '0 3 * * *', 'select public.gerar_previstas_pendentes();');

revoke execute on function public.gerar_previstas_pendentes() from public, anon, authenticated;
grant execute on function public.gerar_previstas_pendentes() to service_role;