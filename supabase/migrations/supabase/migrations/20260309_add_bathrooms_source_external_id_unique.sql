create unique index if not exists bathrooms_source_external_id_unique
on public.bathrooms (source, source_external_id);