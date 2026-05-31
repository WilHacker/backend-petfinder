-- Eliminar tabla anterior de calificaciones por avistamiento
DROP TABLE IF EXISTS calificaciones_avistamiento;

-- Agregar campos de reputación al perfil del rescatista
ALTER TABLE personas
  ADD COLUMN reputacion           DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN total_calificaciones INT          NOT NULL DEFAULT 0;

-- Nueva tabla de calificaciones dirigidas a un rescatista específico
CREATE TABLE calificaciones_rescatista (
  calificacion_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  avistamiento_id         UUID NOT NULL REFERENCES avistamientos(avistamiento_id) ON DELETE CASCADE,
  autor_usuario_id        UUID REFERENCES usuarios(usuario_id) ON DELETE SET NULL,
  rescatista_usuario_id   UUID REFERENCES usuarios(usuario_id) ON DELETE SET NULL,
  estrellas               INT  NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  mensaje                 TEXT,
  creado_el               TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (avistamiento_id, rescatista_usuario_id)
);
