-- ============================================================
-- Comorar — Storage privado para comprovantes
-- Caminho: {casa_id}/{arquivo}. Acesso restrito a membros da casa.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

drop policy if exists "comprovantes_insert" on storage.objects;
create policy "comprovantes_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1]::uuid is not null
    and public.is_casa_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "comprovantes_select" on storage.objects;
create policy "comprovantes_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1]::uuid is not null
    and public.is_casa_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "comprovantes_update" on storage.objects;
create policy "comprovantes_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1]::uuid is not null
    and public.is_casa_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "comprovantes_delete" on storage.objects;
create policy "comprovantes_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1]::uuid is not null
    and public.is_casa_member((storage.foldername(name))[1]::uuid)
  );