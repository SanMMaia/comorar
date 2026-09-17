-- Índices de cobertura para FKs apontadas pelo performance advisor:
-- filtros por pagador, confirmador e regras por usuário.
create index if not exists despesas_pago_por_idx on public.despesas (pago_por);
create index if not exists rateios_confirmado_por_idx on public.rateios (confirmado_por);
create index if not exists recorrencias_pagador_padrao_idx on public.recorrencias (pagador_padrao);
create index if not exists regras_rateio_user_id_idx on public.regras_rateio (user_id);