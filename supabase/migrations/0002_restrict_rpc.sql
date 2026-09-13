-- ============================================================
-- Comorar — restringe RPCs a usuários autenticados
-- ------------------------------------------------------------
-- As funções SECURITY DEFINER são necessárias para:
--  - policies de RLS (is_casa_member / is_casa_owner) evitam recursão
--  - create_casa / join_casa gravam tabelas protegidas por RLS
-- Mas o acesso via API sem login (role anon) deve ser negado.
-- ============================================================

revoke execute on function public.is_casa_member(uuid) from public, anon;
revoke execute on function public.is_casa_owner(uuid) from public, anon;
revoke execute on function public.create_casa(text) from public, anon;
revoke execute on function public.join_casa(text) from public, anon;

grant execute on function public.is_casa_member(uuid) to authenticated;
grant execute on function public.is_casa_owner(uuid) to authenticated;
grant execute on function public.create_casa(text) to authenticated;
grant execute on function public.join_casa(text) to authenticated;