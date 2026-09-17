-- Revoga o direito de executar a event trigger de dev `rls_auto_enable`,
-- que ligava RLS automaticamente em tabelas novas (apenas de dev).
-- O grant default era herdado via role `public`.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;