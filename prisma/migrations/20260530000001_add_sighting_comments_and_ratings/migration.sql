CREATE TABLE comentarios_avistamiento (
  comentario_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  avistamiento_id  UUID NOT NULL REFERENCES avistamientos(avistamiento_id) ON DELETE CASCADE,
  autor_usuario_id UUID REFERENCES usuarios(usuario_id) ON DELETE SET NULL,
  mensaje          TEXT NOT NULL,
  foto_url         TEXT,
  ubicacion_gps    geometry(Point, 4326),
  creado_el        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE calificaciones_avistamiento (
  avistamiento_id  UUID PRIMARY KEY REFERENCES avistamientos(avistamiento_id) ON DELETE CASCADE,
  autor_usuario_id UUID REFERENCES usuarios(usuario_id) ON DELETE SET NULL,
  confirmado       BOOLEAN NOT NULL,
  estrellas        INT NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  creado_el        TIMESTAMPTZ DEFAULT NOW()
);
