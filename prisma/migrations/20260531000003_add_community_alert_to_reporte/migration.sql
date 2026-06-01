ALTER TABLE reportes_extravio
  ADD COLUMN alerta_comunidad_activa  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN alerta_comunidad_expira_el TIMESTAMPTZ;
