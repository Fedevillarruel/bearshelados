-- Bears Helados intentionally does not seed operational data.
-- Create users, franchises, courses, and manuals from the administration panel.
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'El esquema base no está instalado. Ejecutá primero supabase/setup-completo.sql en un proyecto vacío o aplicá las migraciones pendientes.';
  end if;
end;
$$;