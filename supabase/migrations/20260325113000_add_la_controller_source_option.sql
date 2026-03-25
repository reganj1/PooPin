alter table if exists public.bathrooms
drop constraint if exists bathrooms_source_check;

alter table if exists public.bathrooms
add constraint bathrooms_source_check
check (source in ('user', 'google_places', 'city_open_data', 'openstreetmap', 'partner', 'la_controller', 'other'));
