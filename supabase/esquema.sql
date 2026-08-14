-- =========================================================================
-- Panel de Supervisión de Operaciones — esquema para Supabase
--
-- Cómo usarlo:
--   1. Entra a tu proyecto en supabase.com
--   2. Menú lateral: SQL Editor  →  New query
--   3. Pega TODO este archivo y pulsa Run
--
-- Se puede volver a ejecutar sin problema: no borra nada.
-- =========================================================================

-- Versiones anteriores creaban un disparador sobre auth.users que impedía dar
-- de alta usuarios desde el panel de Supabase. Se retira.
drop trigger if exists panel_al_crear_usuario on auth.users;
drop function if exists panel_nuevo_usuario();

-- ------------------------------------------------------------------ Tablas

-- Todo el contenido del panel en una sola fila de JSON.
create table if not exists panel_estado (
  id              int primary key default 1,
  datos           jsonb       not null default '{}'::jsonb,
  version         bigint      not null default 1,
  actualizado     timestamptz not null default now(),
  actualizado_por text,
  constraint una_sola_fila check (id = 1)
);

insert into panel_estado (id, datos) values (1, '{}'::jsonb)
  on conflict (id) do nothing;

-- Quién puede cargar información. Quien no esté aquí solo consulta.
create table if not exists panel_editores (
  correo text primary key,
  nota   text,
  creado timestamptz not null default now()
);

-- Cada guardado deja una copia, por si hay que volver atrás.
create table if not exists panel_historial (
  id           bigserial primary key,
  version      bigint      not null,
  datos        jsonb       not null,
  guardado     timestamptz not null default now(),
  guardado_por text
);
create index if not exists panel_historial_fecha on panel_historial (guardado desc);

-- ------------------------------------------------------- Quién es cada uno

-- Correo de quien está usando el panel en este momento
create or replace function panel_correo()
returns text language sql stable as $$
  select lower(coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    ''));
$$;

create or replace function panel_es_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from panel_editores
    where lower(correo) = panel_correo() and panel_correo() <> ''
  );
$$;

-- --------------------------------------------------------------- Permisos
-- Sin haber entrado no se ve nada: la clave pública del panel por sí sola
-- no da acceso a la información.

alter table panel_estado    enable row level security;
alter table panel_editores  enable row level security;
alter table panel_historial enable row level security;

drop policy if exists "leer estado"        on panel_estado;
drop policy if exists "escribir estado"    on panel_estado;
drop policy if exists "leer editores"      on panel_editores;
drop policy if exists "leer historial"     on panel_historial;
drop policy if exists "escribir historial" on panel_historial;

-- Cualquiera que haya entrado puede consultar
create policy "leer estado" on panel_estado
  for select to authenticated using (true);

-- Solo el editor modifica
create policy "escribir estado" on panel_estado
  for update to authenticated using (panel_es_editor()) with check (panel_es_editor());

create policy "leer editores" on panel_editores
  for select to authenticated using (true);

create policy "leer historial" on panel_historial
  for select to authenticated using (panel_es_editor());

create policy "escribir historial" on panel_historial
  for insert to authenticated with check (panel_es_editor());

-- ------------------------------------------------- Guardado con historial
-- El panel llama a esta función en vez de escribir la tabla directamente:
-- así se controla que nadie pise el trabajo de otro y queda la copia.
create or replace function panel_guardar(p_version bigint, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actual bigint;
  v_quien  text;
begin
  if not panel_es_editor() then
    return jsonb_build_object('ok', false, 'error', 'solo_consulta');
  end if;

  select version into v_actual from panel_estado where id = 1 for update;

  if p_version is not null and p_version <> v_actual then
    return jsonb_build_object('ok', false, 'error', 'desactualizado', 'version', v_actual);
  end if;

  v_quien := coalesce(nullif(panel_correo(), ''), 'alguien');

  update panel_estado
     set datos = p_datos, version = v_actual + 1,
         actualizado = now(), actualizado_por = v_quien
   where id = 1;

  insert into panel_historial (version, datos, guardado_por)
       values (v_actual + 1, p_datos, v_quien);

  delete from panel_historial
   where id not in (select id from panel_historial order by id desc limit 50);

  return jsonb_build_object('ok', true, 'version', v_actual + 1);
end $$;

grant execute on function panel_guardar(bigint, jsonb) to authenticated;

-- Consultar la versión sin descargar todo (para saber si alguien cargó algo)
create or replace function panel_version()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', version, 'actualizado', actualizado, 'por', actualizado_por,
    'correo', panel_correo(),
    'rol', case when panel_es_editor() then 'editor' else 'consulta' end)
  from panel_estado where id = 1;
$$;

grant execute on function panel_version() to authenticated;

-- ------------------------------------------------- Documentos PDF (Storage)
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "ver documentos"        on storage.objects;
drop policy if exists "subir documentos"      on storage.objects;
drop policy if exists "actualizar documentos" on storage.objects;
drop policy if exists "borrar documentos"     on storage.objects;

create policy "ver documentos" on storage.objects
  for select to authenticated using (bucket_id = 'documentos');

create policy "subir documentos" on storage.objects
  for insert to authenticated with check (bucket_id = 'documentos' and panel_es_editor());

create policy "actualizar documentos" on storage.objects
  for update to authenticated using (bucket_id = 'documentos' and panel_es_editor());

create policy "borrar documentos" on storage.objects
  for delete to authenticated using (bucket_id = 'documentos' and panel_es_editor());

-- --------------------------------------------- Cambios al instante (opcional)
-- Permite que el panel se entere en el momento en que alguien carga algo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'panel_estado'
  ) then
    alter publication supabase_realtime add table panel_estado;
  end if;
end $$;

-- =========================================================================
-- Vistas para consultar los resultados con SQL normal
-- =========================================================================

create or replace view v_indicadores as
select
  i->>'id'                                  as id,
  i->>'nombre'                              as nombre,
  i->>'unidad'                              as unidad,
  nullif(i->>'meta','')::numeric            as meta,
  i->>'direccion'                           as direccion,
  nullif(i->>'peso','')::numeric            as peso,
  coalesce((i->>'activo')::boolean, true)   as activo
from panel_estado, jsonb_array_elements(coalesce(datos->'indicadores', '[]'::jsonb)) as i
where id = 1;

create or replace view v_resultados as
select
  r->>'fecha'                            as fecha,
  r->>'agente'                           as agente,
  r->>'doc'                              as documento,
  r->>'skill'                            as skill,
  r->>'performance'                      as performance,
  nullif(r->>'pesoInforme','')::numeric  as peso_informe,
  v.key                                  as indicador_id,
  nullif(v.value::text,'null')::numeric  as valor,
  nullif(r->'metas'->>v.key,'')::numeric as meta
from panel_estado,
     jsonb_array_elements(coalesce(datos->'registros', '[]'::jsonb)) as r,
     jsonb_each(coalesce(r->'valores', '{}'::jsonb)) as v
where id = 1;

create or replace view v_resultados_detalle as
select
  res.fecha, res.agente, res.documento, res.skill, res.performance,
  ind.nombre as indicador, ind.unidad, ind.direccion,
  res.valor, coalesce(res.meta, ind.meta) as meta,
  case
    when coalesce(res.meta, ind.meta) is null then null
    when coalesce(res.meta, ind.meta) = 0 then
      case when ind.direccion = 'down' and res.valor <= 0 then 100 else 0 end
    when ind.direccion = 'down' then
      least(100, case when res.valor <= 0 then 100
                      else coalesce(res.meta, ind.meta) / res.valor * 100 end)
    else least(100, res.valor / coalesce(res.meta, ind.meta) * 100)
  end as cumplimiento_pct
from v_resultados res
join v_indicadores ind on ind.id = res.indicador_id;

create or replace view v_puntajes as
select
  d.fecha, d.agente, d.documento, d.skill,
  round(sum(d.cumplimiento_pct * coalesce(i.peso,1)) / nullif(sum(coalesce(i.peso,1)),0), 1) as puntaje,
  count(*) as indicadores
from v_resultados_detalle d
join v_indicadores i on i.nombre = d.indicador
where d.cumplimiento_pct is not null and coalesce(i.peso,1) > 0
group by d.fecha, d.agente, d.documento, d.skill;

create or replace view v_turnos as
select
  t->>'fecha'   as fecha,
  t->>'agente'  as agente,
  t->>'doc'     as documento,
  t->>'skill'   as skill,
  t->>'estado'  as novedad,
  nullif(t->>'ini','')::int as inicio_min,
  nullif(t->>'fin','')::int as fin_min
from panel_estado, jsonb_array_elements(coalesce(datos->'turnos', '[]'::jsonb)) as t
where id = 1;

-- =========================================================================
-- Último paso: apúntate como editor para poder cargar información.
-- Cambia el correo por el tuyo (el mismo con el que creaste el usuario):
--
--   insert into panel_editores (correo, nota)
--   values ('tucorreo@empresa.com', 'Supervisor')
--   on conflict (correo) do nothing;
--
-- Los demás no hace falta registrarlos: con solo tener usuario ya pueden
-- consultar, y al no estar en esta tabla no pueden modificar nada.
-- =========================================================================
