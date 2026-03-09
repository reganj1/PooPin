insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restroom-photos',
  'restroom-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anon upload restroom photos'
  ) then
    create policy "Anon upload restroom photos"
      on storage.objects
      for insert
      to anon
      with check (bucket_id = 'restroom-photos');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read approved restroom photos'
  ) then
    create policy "Public read approved restroom photos"
      on storage.objects
      for select
      to anon
      using (
        bucket_id = 'restroom-photos'
        and exists (
          select 1
          from public.photos p
          where p.storage_path = storage.objects.name
            and p.status = 'active'
        )
      );
  end if;
end $$;

