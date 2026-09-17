-- Claim: morador "sem app" (user_id null) que já existe com o e-mail do
-- usuário logado é vinculado à conta ao entrar com o código, evitando morador duplicado.
create or replace function public.join_casa(p_codigo text)
returns public.casas
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_casa public.casas;
  v_email text;
  v_extra public.casa_morador;
begin
  select * into v_casa
    from public.casas
    where codigo_convite = upper(trim(p_codigo));

  if not found then
    raise exception 'código de convite inválido';
  end if;

  -- Tenta vincular um morador sem app cujo e-mail seja o do usuário logado.
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if v_email is not null then
    select * into v_extra
      from public.casa_morador
      where casa_id = v_casa.id
        and user_id is null
        and lower(email) = lower(v_email)
      order by criado_em asc
      limit 1;
    if found then
      update public.casa_morador
        set user_id = auth.uid(), ativo = true
        where id = v_extra.id;
      return v_casa;
    end if;
  end if;

  insert into public.casa_morador (casa_id, user_id, role)
    values (v_casa.id, auth.uid(), 'member')
    on conflict (casa_id, user_id) where user_id is not null
    do update set ativo = true;

  return v_casa;
end;
$$;