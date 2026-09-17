-- ============================================================
-- Corrige trg_orcamento_excedido: format() do Postgres não
-- suporta %.0f — o percentual é pré-formatado como texto.
-- ============================================================

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
  v_pct text;
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

  v_pct := round((v_usado / v_limite) * 100, 0)::text;

  for v_uid in
    select m.user_id
    from public.casa_morador m
    where m.casa_id = new.casa_id and m.user_id is not null and m.ativo
  loop
    perform public.notificar_usuario(
      v_uid,
      'orcamento_excedido',
      'Orçamento excedido',
      format('Categoria "%s": R$ %s de um limite de R$ %s (%s%%).', v_cat, round(v_usado, 2), v_limite, v_pct),
      '/balanco'
    );
  end loop;

  return new;
end;
$$;

revoke execute on function public.trg_orcamento_excedido() from public, anon, authenticated;