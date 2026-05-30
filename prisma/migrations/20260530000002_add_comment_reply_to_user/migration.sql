ALTER TABLE comentarios_avistamiento
ADD COLUMN reply_to_user_id UUID REFERENCES usuarios(usuario_id) ON DELETE SET NULL;
