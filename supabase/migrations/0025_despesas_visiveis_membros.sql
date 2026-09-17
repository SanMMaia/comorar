-- ============================================================
-- Comorar — despesas visíveis para a casa; rateios privados
-- ------------------------------------------------------------
-- A restrição de SELECT em `despesas` (0021) impedia um morador de
-- confirmar uma prevista: o UPDATE passa a linha nova ("confirmada",
-- ainda sem rateio) e a RLS por participação a esconderia, rejeitando
-- a operação. Mantemos as despesas visíveis a todos os membros da casa
-- (transparência: fornecedor, valor e quem pagou) e restringimos apenas
-- os rateios — a dívida individual — ao responsável ou ao próprio morador.
-- A visão "só o que me envolve" do morador é aplicada na interface.
-- ============================================================

drop policy if exists despesas_select on public.despesas;
create policy despesas_select on public.despesas
  for select to authenticated
  using (public.is_casa_member(casa_id));
