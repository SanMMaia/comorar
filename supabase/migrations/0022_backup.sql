-- ============================================================
-- Comorar — backup e restauração (JSON)
-- Exporta uma casa inteira (responsável) e restaura como uma casa nova,
-- remapeando todos os ids. Moradores sem app viram placeholders (extra);
-- o usuário que restaura assume o papel de responsável.
-- ============================================================

-- helpers de visibilidade: somente autenticados
revoke execute on function public.meu_morador_id(uuid) from public, anon;
revoke execute on function public.meu_morador_da_despesa(uuid) from public, anon;
revoke execute on function public.sou_owner_da_despesa(uuid) from public, anon;
revoke execute on function public.participa_despesa(uuid) from public, anon;
grant execute on function public.meu_morador_id(uuid) to authenticated;
grant execute on function public.meu_morador_da_despesa(uuid) to authenticated;
grant execute on function public.sou_owner_da_despesa(uuid) to authenticated;
grant execute on function public.participa_despesa(uuid) to authenticated;

-- ---------- exportar ----------

create or replace function public.exportar_backup(p_casa uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not public.is_casa_owner(p_casa) then
    raise exception 'Apenas o responsável pode exportar o backup.';
  end if;

  select jsonb_build_object(
    'app', 'comorar',
    'versao', 1,
    'exportado_em', now(),
    'casa', jsonb_build_object(
      'nome', c.nome,
      'categorias', c.categorias
    ),
    'moradores', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.criado_em)
      from public.casa_morador m where m.casa_id = p_casa
    ), '[]'::jsonb),
    'regras_rateio', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.regras_rateio r where r.casa_id = p_casa
    ), '[]'::jsonb),
    'recorrencias', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.recorrencias r where r.casa_id = p_casa
    ), '[]'::jsonb),
    'despesas', coalesce((
      select jsonb_agg(to_jsonb(d))
      from public.despesas d where d.casa_id = p_casa
    ), '[]'::jsonb),
    'rateios', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.rateios x
      join public.despesas d on d.id = x.despesa_id
      where d.casa_id = p_casa
    ), '[]'::jsonb),
    'orcamentos', coalesce((
      select jsonb_agg(to_jsonb(o))
      from public.orcamentos o where o.casa_id = p_casa
    ), '[]'::jsonb)
  )
  into v_res
  from public.casas c
  where c.id = p_casa;

  if v_res is null then
    raise exception 'Casa não encontrada.';
  end if;

  return v_res;
end;
$$;

-- ---------- restaurar ----------

create or replace function public.restaurar_backup(p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_casa uuid;
  v_morador record;
  v_despesa record;
  v_recorrencia record;
  v_rateio record;
  v_orcamento record;
  v_regra record;
  v_novo_morador uuid;
  v_nova_despesa uuid;
  v_nova_recorrencia uuid;
  v_map_morador jsonb := '{}'::jsonb;
  v_map_despesa jsonb := '{}'::jsonb;
  v_map_recorrencia jsonb := '{}'::jsonb;
  v_tem_owner boolean := false;
begin
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;
  if coalesce(p_dados->>'app', '') <> 'comorar' then
    raise exception 'Arquivo de backup inválido.';
  end if;

  insert into public.casas (nome, categorias)
  values (
    coalesce(nullif(p_dados->'casa'->>'nome', ''), 'Casa restaurada'),
    coalesce(p_dados->'casa'->'categorias', '[]'::jsonb)
  )
  returning id into v_casa;

  -- moradores
  for v_morador in
    select * from jsonb_to_recordset(coalesce(p_dados->'moradores', '[]'::jsonb)) as x(
      id uuid, user_id uuid, role text, nome text, email text
    )
  loop
    v_novo_morador := gen_random_uuid();
    v_map_morador := v_map_morador || jsonb_build_object(v_morador.id::text, v_novo_morador::text);
    insert into public.casa_morador (id, casa_id, user_id, role, ativo, nome, email)
    values (
      v_novo_morador,
      v_casa,
      case when v_morador.user_id = v_uid then v_uid else null end,
      case when v_morador.user_id = v_uid then 'owner' else 'member' end,
      true,
      coalesce(nullif(v_morador.nome, ''), 'Morador'),
      v_morador.email
    );
    if v_morador.user_id = v_uid then
      v_tem_owner := true;
    end if;
  end loop;

  if not v_tem_owner then
    insert into public.casa_morador (casa_id, user_id, role, ativo, nome, email)
    values (v_casa, v_uid, 'owner', true, 'Você', null);
  end if;

  -- regras de rateio (só o responsável tem conta no app restaurado)
  for v_regra in
    select * from jsonb_to_recordset(coalesce(p_dados->'regras_rateio', '[]'::jsonb)) as x(
      user_id uuid, percentual numeric
    )
  loop
    if v_regra.user_id = v_uid then
      insert into public.regras_rateio (casa_id, user_id, percentual)
      values (v_casa, v_uid, v_regra.percentual)
      on conflict do nothing;
    end if;
  end loop;

  -- orçamentos (antes das despesas: o trigger de estouro consulta a tabela)
  for v_orcamento in
    select * from jsonb_to_recordset(coalesce(p_dados->'orcamentos', '[]'::jsonb)) as x(
      categoria text, mes text, limite numeric
    )
  loop
    insert into public.orcamentos (casa_id, categoria, mes, limite)
    values (v_casa, coalesce(v_orcamento.categoria, 'Geral'), v_orcamento.mes, v_orcamento.limite)
    on conflict do nothing;
  end loop;

  -- recorrências
  for v_recorrencia in
    select * from jsonb_to_recordset(coalesce(p_dados->'recorrencias', '[]'::jsonb)) as x(
      id uuid, fornecedor text, descricao text, categoria text, valor_previsto numeric,
      data_inicio date, data_fim date, dia_vencimento integer, intervalo text,
      tipo_rateio text, pagador_padrao uuid, rotativo boolean, ativa boolean
    )
  loop
    insert into public.recorrencias (
      casa_id, fornecedor, descricao, categoria, valor_previsto, data_inicio, data_fim,
      dia_vencimento, intervalo, tipo_rateio, pagador_padrao, rotativo, ativa
    )
    values (
      v_casa, v_recorrencia.fornecedor, v_recorrencia.descricao,
      v_recorrencia.categoria::categoria, v_recorrencia.valor_previsto,
      v_recorrencia.data_inicio, v_recorrencia.data_fim, v_recorrencia.dia_vencimento,
      coalesce(v_recorrencia.intervalo, 'mensal')::intervalo_recorrencia,
      coalesce(v_recorrencia.tipo_rateio, 'igual')::tipo_rateio,
      (v_map_morador->>v_recorrencia.pagador_padrao::text)::uuid,
      coalesce(v_recorrencia.rotativo, false), coalesce(v_recorrencia.ativa, true)
    )
    returning id into v_nova_recorrencia;
    v_map_recorrencia := v_map_recorrencia
      || jsonb_build_object(v_recorrencia.id::text, v_nova_recorrencia::text);
  end loop;

  -- despesas (comprovante/boleto não são portáveis)
  for v_despesa in
    select * from jsonb_to_recordset(coalesce(p_dados->'despesas', '[]'::jsonb)) as x(
      id uuid, fornecedor text, descricao text, valor numeric, categoria text,
      pago_por uuid, tipo_rateio text, status text, origem_recorrencia_id uuid,
      data date, ocr_resultado jsonb
    )
  loop
    insert into public.despesas (
      casa_id, fornecedor, descricao, valor, categoria, pago_por, tipo_rateio,
      status, origem_recorrencia_id, data, ocr_resultado
    )
    values (
      v_casa, v_despesa.fornecedor, v_despesa.descricao, v_despesa.valor,
      v_despesa.categoria::categoria,
      (v_map_morador->>v_despesa.pago_por::text)::uuid,
      coalesce(v_despesa.tipo_rateio, 'igual')::tipo_rateio,
      coalesce(v_despesa.status, 'confirmada')::status_despesa,
      (v_map_recorrencia->>v_despesa.origem_recorrencia_id::text)::uuid,
      v_despesa.data, v_despesa.ocr_resultado
    )
    returning id into v_nova_despesa;
    v_map_despesa := v_map_despesa
      || jsonb_build_object(v_despesa.id::text, v_nova_despesa::text);
  end loop;

  -- rateios
  for v_rateio in
    select * from jsonb_to_recordset(coalesce(p_dados->'rateios', '[]'::jsonb)) as x(
      despesa_id uuid, morador_id uuid, valor_rateado numeric, pago boolean,
      pago_em timestamptz, confirmado_por uuid
    )
  loop
    insert into public.rateios (
      despesa_id, morador_id, valor_rateado, pago, pago_em, confirmado_por
    )
    values (
      (v_map_despesa->>v_rateio.despesa_id::text)::uuid,
      (v_map_morador->>v_rateio.morador_id::text)::uuid,
      v_rateio.valor_rateado,
      coalesce(v_rateio.pago, false),
      v_rateio.pago_em,
      case when v_rateio.confirmado_por = v_uid then v_uid else null end
    );
  end loop;

  return v_casa;
end;
$$;

revoke execute on function public.exportar_backup(uuid) from public, anon;
revoke execute on function public.restaurar_backup(jsonb) from public, anon;
grant execute on function public.exportar_backup(uuid) to authenticated;
grant execute on function public.restaurar_backup(jsonb) to authenticated;
