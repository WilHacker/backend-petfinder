CREATE TABLE lecturas_comentarios (
  usuario_id       UUID NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  avistamiento_id  UUID NOT NULL REFERENCES avistamientos(avistamiento_id) ON DELETE CASCADE,
  leido_hasta_el   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, avistamiento_id)
);
