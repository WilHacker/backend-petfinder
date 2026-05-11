-- Una mascota solo puede estar en UNA zona segura a la vez (físicamente imposible estar en dos)

-- Limpia duplicados: por cada mascota que esté en varias zonas, conserva solo la más reciente (mayor zona_id)
DELETE FROM zona_mascotas zm
WHERE zm.zona_id NOT IN (
  SELECT MAX(zona_id)
  FROM zona_mascotas
  GROUP BY mascota_id
);

-- Ahora aplica el constraint único
CREATE UNIQUE INDEX "zona_mascotas_mascota_id_key" ON "zona_mascotas"("mascota_id");
