-- O pagador que adiantou o valor integral já está quite com a própria parte.
-- Marca como pago o rateio de quem pagou a despesa (dados criados antes dessa regra).
update public.rateios r
set pago = true,
    pago_em = coalesce(r.pago_em, now()),
    confirmado_por = coalesce(r.confirmado_por, (select cm.user_id from public.casa_morador cm where cm.id = r.morador_id))
from public.despesas d
where d.id = r.despesa_id
  and d.status = 'confirmada'
  and d.pago_por is not null
  and r.morador_id = d.pago_por
  and r.pago = false;