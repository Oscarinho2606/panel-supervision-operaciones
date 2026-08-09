-- =========================================================================
-- Panel de Supervisión de Operaciones — esquema de la base de datos
-- Se ejecuta solo; volver a lanzarlo no borra nada.
-- =========================================================================

-- El estado completo del panel vive en una fila de JSONB. Así el panel guarda
-- y recupera exactamente lo mismo que tenía en el navegador, sin perder nada
-- al añadir campos nuevos más adelante.
CREATE TABLE IF NOT EXISTS estado (
  id           integer     PRIMARY KEY DEFAULT 1,
  datos        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  version      bigint      NOT NULL DEFAULT 1,
  actualizado  timestamptz NOT NULL DEFAULT now(),
  actualizado_por text,
  CONSTRAINT una_sola_fila CHECK (id = 1)
);

INSERT INTO estado (id, datos) VALUES (1, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

-- Los PDF de la base de conocimiento, aparte para no inflar el JSON
CREATE TABLE IF NOT EXISTS archivos (
  id         text        PRIMARY KEY,
  nombre     text,
  tipo       text,
  tamano     bigint,
  contenido  bytea       NOT NULL,
  creado     timestamptz NOT NULL DEFAULT now()
);

-- Historial: cada guardado deja una copia, por si hay que volver atrás
CREATE TABLE IF NOT EXISTS historial (
  id          bigserial   PRIMARY KEY,
  version     bigint      NOT NULL,
  datos       jsonb       NOT NULL,
  guardado    timestamptz NOT NULL DEFAULT now(),
  guardado_por text
);
CREATE INDEX IF NOT EXISTS historial_guardado_idx ON historial (guardado DESC);

-- =========================================================================
-- Vistas para consultar la información con SQL corriente.
-- Se calculan sobre el mismo JSON, así que nunca se desincronizan.
-- =========================================================================

CREATE OR REPLACE VIEW v_indicadores AS
SELECT
  i->>'id'                       AS id,
  i->>'nombre'                   AS nombre,
  i->>'unidad'                   AS unidad,
  (i->>'meta')::numeric          AS meta,
  i->>'direccion'                AS direccion,
  (i->>'peso')::numeric          AS peso,
  COALESCE((i->>'activo')::boolean, true) AS activo
FROM estado, jsonb_array_elements(COALESCE(datos->'indicadores', '[]'::jsonb)) AS i
WHERE id = 1;

CREATE OR REPLACE VIEW v_resultados AS
SELECT
  r->>'fecha'                    AS fecha,
  r->>'agente'                   AS agente,
  r->>'doc'                      AS documento,
  r->>'skill'                    AS skill,
  r->>'performance'              AS performance,
  (r->>'pesoInforme')::numeric   AS peso_informe,
  v.key                          AS indicador_id,
  v.value::text::numeric         AS valor,
  (r->'metas'->>v.key)::numeric  AS meta
FROM estado,
     jsonb_array_elements(COALESCE(datos->'registros', '[]'::jsonb)) AS r,
     jsonb_each(COALESCE(r->'valores', '{}'::jsonb)) AS v
WHERE id = 1;

-- Resultados con el nombre del indicador y su cumplimiento ya calculado
CREATE OR REPLACE VIEW v_resultados_detalle AS
SELECT
  res.fecha, res.agente, res.documento, res.skill, res.performance,
  ind.nombre AS indicador, ind.unidad, ind.direccion,
  res.valor, COALESCE(res.meta, ind.meta) AS meta,
  CASE
    WHEN COALESCE(res.meta, ind.meta) IS NULL THEN NULL
    WHEN COALESCE(res.meta, ind.meta) = 0 THEN
      CASE WHEN ind.direccion = 'down' AND res.valor <= 0 THEN 100 ELSE 0 END
    WHEN ind.direccion = 'down' THEN
      LEAST(100, CASE WHEN res.valor <= 0 THEN 100
                      ELSE COALESCE(res.meta, ind.meta) / res.valor * 100 END)
    ELSE LEAST(100, res.valor / COALESCE(res.meta, ind.meta) * 100)
  END AS cumplimiento_pct
FROM v_resultados res
JOIN v_indicadores ind ON ind.id = res.indicador_id;

-- Puntaje por agente: promedio ponderado de sus cumplimientos, tope 100
CREATE OR REPLACE VIEW v_puntajes AS
SELECT
  d.fecha, d.agente, d.documento, d.skill,
  ROUND(SUM(d.cumplimiento_pct * COALESCE(i.peso, 1)) / NULLIF(SUM(COALESCE(i.peso, 1)), 0), 1) AS puntaje,
  COUNT(*) AS indicadores
FROM v_resultados_detalle d
JOIN v_indicadores i ON i.nombre = d.indicador
WHERE d.cumplimiento_pct IS NOT NULL AND COALESCE(i.peso, 1) > 0
GROUP BY d.fecha, d.agente, d.documento, d.skill;

CREATE OR REPLACE VIEW v_turnos AS
SELECT
  t->>'fecha'                AS fecha,
  t->>'agente'               AS agente,
  t->>'doc'                  AS documento,
  t->>'skill'                AS skill,
  t->>'estado'               AS novedad,
  (t->>'ini')::int           AS inicio_min,
  (t->>'fin')::int           AS fin_min,
  ROUND(((t->>'fin')::numeric - (t->>'ini')::numeric) / 60, 2) AS horas_turno
FROM estado, jsonb_array_elements(COALESCE(datos->'turnos', '[]'::jsonb)) AS t
WHERE id = 1;
