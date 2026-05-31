DROP TABLE IF EXISTS calificaciones_rescatista;

ALTER TABLE personas
  DROP COLUMN IF EXISTS reputacion,
  DROP COLUMN IF EXISTS total_calificaciones;
