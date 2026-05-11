-- Revierte el constraint incorrecto: una mascota SÍ puede registrarse en varias zonas.
-- La presencia física (una sola zona activa por GPS) se detecta vía PostGIS, no por constraint.
DROP INDEX IF EXISTS "zona_mascotas_mascota_id_key";
