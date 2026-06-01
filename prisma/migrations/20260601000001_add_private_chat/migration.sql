-- AlterTable: agregar rescatista_usuario_id a avistamientos
ALTER TABLE avistamientos
  ADD COLUMN rescatista_usuario_id UUID REFERENCES usuarios(usuario_id) ON DELETE SET NULL;

-- CreateTable: conversaciones_privadas
CREATE TABLE conversaciones_privadas (
  conversacion_id        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  mascota_id             UUID        NOT NULL REFERENCES mascotas(mascota_id) ON DELETE CASCADE,
  avistamiento_origen_id UUID        REFERENCES avistamientos(avistamiento_id) ON DELETE SET NULL,
  dueno_usuario_id       UUID        NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  rescatista_usuario_id  UUID        NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  estado                 TEXT        NOT NULL DEFAULT 'pendiente',
  intentos               INT         NOT NULL DEFAULT 1,
  max_intentos           INT         NOT NULL DEFAULT 2,
  creado_el              TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT conversaciones_privadas_estado_check
    CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  CONSTRAINT conversaciones_privadas_unique
    UNIQUE (mascota_id, dueno_usuario_id, rescatista_usuario_id)
);

-- CreateTable: mensajes_chat
CREATE TABLE mensajes_chat (
  mensaje_id        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversacion_id   UUID        NOT NULL REFERENCES conversaciones_privadas(conversacion_id) ON DELETE CASCADE,
  autor_usuario_id  UUID        REFERENCES usuarios(usuario_id) ON DELETE SET NULL,
  contenido         TEXT,
  foto_url          TEXT,
  ubicacion_gps     geometry(Point, 4326),
  creado_el         TIMESTAMPTZ DEFAULT NOW(),
  leido_el          TIMESTAMPTZ,
  CONSTRAINT mensajes_chat_al_menos_un_campo
    CHECK (contenido IS NOT NULL OR foto_url IS NOT NULL OR ubicacion_gps IS NOT NULL)
);

-- Index para queries frecuentes
CREATE INDEX idx_conversaciones_dueno   ON conversaciones_privadas(dueno_usuario_id);
CREATE INDEX idx_conversaciones_rescatista ON conversaciones_privadas(rescatista_usuario_id);
CREATE INDEX idx_mensajes_conversacion   ON mensajes_chat(conversacion_id, creado_el);
CREATE INDEX idx_mensajes_no_leidos      ON mensajes_chat(conversacion_id, leido_el) WHERE leido_el IS NULL;
