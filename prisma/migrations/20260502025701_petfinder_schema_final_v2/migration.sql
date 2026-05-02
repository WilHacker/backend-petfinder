/*
  Warnings:

  - The primary key for the `mascotas` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `mascotas` table. All the data in the column will be lost.
  - The `estado` column on the `mascotas` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `personas` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `personas` table. All the data in the column will be lost.
  - The `tipo_relacion` column on the `propietarios_mascota` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `usuarios` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `usuarios` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[persona_id]` on the table `usuarios` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `tipo` on the `medios_contacto` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "estado_mascota" AS ENUM ('en_casa', 'en_paseo', 'extraviada', 'recuperada');

-- CreateEnum
CREATE TYPE "tipo_contacto" AS ENUM ('WhatsApp', 'Celular', 'Fijo', 'Telegram');

-- CreateEnum
CREATE TYPE "relacion_propietario" AS ENUM ('Dueño Principal', 'Familiar', 'Cuidador');

-- DropForeignKey
ALTER TABLE "avistamientos" DROP CONSTRAINT "avistamientos_mascota_id_fkey";

-- DropForeignKey
ALTER TABLE "fichas_medicas" DROP CONSTRAINT "fichas_medicas_mascota_id_fkey";

-- DropForeignKey
ALTER TABLE "fotos_mascota" DROP CONSTRAINT "fotos_mascota_mascota_id_fkey";

-- DropForeignKey
ALTER TABLE "historial_ubicaciones" DROP CONSTRAINT "historial_ubicaciones_usuario_id_fkey";

-- DropForeignKey
ALTER TABLE "medios_contacto" DROP CONSTRAINT "medios_contacto_persona_id_fkey";

-- DropForeignKey
ALTER TABLE "placas_qr" DROP CONSTRAINT "placas_qr_mascota_id_fkey";

-- DropForeignKey
ALTER TABLE "propietarios_mascota" DROP CONSTRAINT "propietarios_mascota_mascota_id_fkey";

-- DropForeignKey
ALTER TABLE "propietarios_mascota" DROP CONSTRAINT "propietarios_mascota_persona_id_fkey";

-- DropForeignKey
ALTER TABLE "reportes_extravio" DROP CONSTRAINT "reportes_extravio_mascota_id_fkey";

-- DropForeignKey
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_persona_id_fkey";

-- DropForeignKey
ALTER TABLE "zonas_seguras" DROP CONSTRAINT "zonas_seguras_mascota_id_fkey";

-- AlterTable
ALTER TABLE "avistamientos" ALTER COLUMN "mascota_id" DROP NOT NULL,
ALTER COLUMN "fecha_avistamiento" DROP NOT NULL;

-- AlterTable
ALTER TABLE "fotos_mascota" ALTER COLUMN "es_principal" DROP NOT NULL,
ALTER COLUMN "creado_el" DROP NOT NULL;

-- AlterTable
CREATE SEQUENCE historial_ubicaciones_log_id_seq;
ALTER TABLE "historial_ubicaciones" ALTER COLUMN "log_id" SET DEFAULT nextval('historial_ubicaciones_log_id_seq');
ALTER SEQUENCE historial_ubicaciones_log_id_seq OWNED BY "historial_ubicaciones"."log_id";

-- AlterTable
ALTER TABLE "mascotas" DROP CONSTRAINT "mascotas_pkey",
DROP COLUMN "id",
ADD COLUMN     "fecha_ultima_ubicacion" TIMESTAMPTZ,
ADD COLUMN     "mascota_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
ADD COLUMN     "ultima_ubicacion_conocida" geometry(Point, 4326),
DROP COLUMN "estado",
ADD COLUMN     "estado" "estado_mascota" DEFAULT 'en_casa',
ALTER COLUMN "creado_el" DROP NOT NULL,
ADD CONSTRAINT "mascotas_pkey" PRIMARY KEY ("mascota_id");

-- AlterTable
ALTER TABLE "medios_contacto" DROP COLUMN "tipo",
ADD COLUMN     "tipo" "tipo_contacto" NOT NULL,
ALTER COLUMN "es_principal" DROP NOT NULL;

-- AlterTable
ALTER TABLE "personas" DROP CONSTRAINT "personas_pkey",
DROP COLUMN "id",
ADD COLUMN     "persona_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
ALTER COLUMN "creado_el" DROP NOT NULL,
ADD CONSTRAINT "personas_pkey" PRIMARY KEY ("persona_id");

-- AlterTable
ALTER TABLE "placas_qr" ALTER COLUMN "token_acceso" DROP NOT NULL,
ALTER COLUMN "esta_activa" DROP NOT NULL,
ALTER COLUMN "fecha_activacion" DROP NOT NULL;

-- AlterTable
ALTER TABLE "propietarios_mascota" DROP COLUMN "tipo_relacion",
ADD COLUMN     "tipo_relacion" "relacion_propietario" DEFAULT 'Dueño Principal',
ALTER COLUMN "recibe_alertas" DROP NOT NULL,
ALTER COLUMN "mostrar_en_qr" DROP NOT NULL;

-- AlterTable
ALTER TABLE "reportes_extravio" ALTER COLUMN "mascota_id" DROP NOT NULL,
ALTER COLUMN "recompensa" DROP NOT NULL,
ALTER COLUMN "estado_reporte" DROP NOT NULL;

-- AlterTable
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_pkey",
DROP COLUMN "id",
ADD COLUMN     "fecha_ultima_ubicacion" TIMESTAMPTZ,
ADD COLUMN     "ultima_ubicacion_conocida" geometry(Point, 4326),
ADD COLUMN     "usuario_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
ALTER COLUMN "config_privacidad" SET DEFAULT '{"mostrar_foto_qr": true}',
ALTER COLUMN "estado_cuenta" DROP NOT NULL,
ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("usuario_id");

-- AlterTable
ALTER TABLE "zonas_seguras" ADD COLUMN     "punto_central" geometry(Point, 4326),
ADD COLUMN     "radio_metros" DOUBLE PRECISION,
ALTER COLUMN "mascota_id" DROP NOT NULL,
ALTER COLUMN "geometria" DROP NOT NULL,
ALTER COLUMN "esta_activa" DROP NOT NULL;

-- DropEnum
DROP TYPE "EstadoMascota";

-- DropEnum
DROP TYPE "RelacionPropietario";

-- DropEnum
DROP TYPE "TipoContacto";

-- CreateTable
CREATE TABLE "registro_visitas_zonas" (
    "visita_id" BIGSERIAL NOT NULL,
    "mascota_id" UUID,
    "zona_id" INTEGER,
    "fecha_hora_entrada" TIMESTAMPTZ NOT NULL,
    "fecha_hora_salida" TIMESTAMPTZ,
    "duracion_minutos" INTEGER,

    CONSTRAINT "registro_visitas_zonas_pkey" PRIMARY KEY ("visita_id")
);

-- CreateTable
CREATE TABLE "agradecimientos_rescatistas" (
    "agradecimiento_id" SERIAL NOT NULL,
    "avistamiento_id" UUID,
    "autor_usuario_id" UUID,
    "mensaje" TEXT NOT NULL,
    "creado_el" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agradecimientos_rescatistas_pkey" PRIMARY KEY ("agradecimiento_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_persona_id_key" ON "usuarios"("persona_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("persona_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medios_contacto" ADD CONSTRAINT "medios_contacto_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("persona_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propietarios_mascota" ADD CONSTRAINT "propietarios_mascota_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("persona_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propietarios_mascota" ADD CONSTRAINT "propietarios_mascota_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_medicas" ADD CONSTRAINT "fichas_medicas_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_mascota" ADD CONSTRAINT "fotos_mascota_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placas_qr" ADD CONSTRAINT "placas_qr_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zonas_seguras" ADD CONSTRAINT "zonas_seguras_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_ubicaciones" ADD CONSTRAINT "historial_ubicaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("usuario_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_visitas_zonas" ADD CONSTRAINT "registro_visitas_zonas_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_visitas_zonas" ADD CONSTRAINT "registro_visitas_zonas_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "zonas_seguras"("zona_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_extravio" ADD CONSTRAINT "reportes_extravio_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avistamientos" ADD CONSTRAINT "avistamientos_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agradecimientos_rescatistas" ADD CONSTRAINT "agradecimientos_rescatistas_avistamiento_id_fkey" FOREIGN KEY ("avistamiento_id") REFERENCES "avistamientos"("avistamiento_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agradecimientos_rescatistas" ADD CONSTRAINT "agradecimientos_rescatistas_autor_usuario_id_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("usuario_id") ON DELETE SET NULL ON UPDATE CASCADE;
