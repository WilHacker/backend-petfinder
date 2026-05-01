-- CreateEnum
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE TYPE "EstadoMascota" AS ENUM ('en_casa', 'en_paseo', 'extraviada', 'recuperada');

-- CreateEnum
CREATE TYPE "TipoContacto" AS ENUM ('WhatsApp', 'Celular', 'Fijo', 'Telegram');

-- CreateEnum
CREATE TYPE "RelacionPropietario" AS ENUM ('Dueño Principal', 'Familiar', 'Cuidador');

-- CreateTable
CREATE TABLE "personas" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "nombre" VARCHAR(100) NOT NULL,
    "apellido_paterno" VARCHAR(100) NOT NULL,
    "apellido_materno" VARCHAR(100),
    "ci" VARCHAR(20),
    "foto_perfil_url" TEXT,
    "fecha_nacimiento" DATE,
    "creado_el" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "persona_id" UUID NOT NULL,
    "correo_electronico" VARCHAR(255) NOT NULL,
    "clave_hash" TEXT NOT NULL,
    "token_fcm" TEXT,
    "config_privacidad" JSONB DEFAULT '{"mostrar_foto_qr": true, "notificar_por_correo": true}',
    "ultimo_acceso" TIMESTAMPTZ,
    "estado_cuenta" VARCHAR(20) NOT NULL DEFAULT 'activa',

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medios_contacto" (
    "contacto_id" SERIAL NOT NULL,
    "persona_id" UUID NOT NULL,
    "tipo" "TipoContacto" NOT NULL,
    "valor" VARCHAR(50) NOT NULL,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "medios_contacto_pkey" PRIMARY KEY ("contacto_id")
);

-- CreateTable
CREATE TABLE "razas" (
    "raza_id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "especie" VARCHAR(50) NOT NULL,

    CONSTRAINT "razas_pkey" PRIMARY KEY ("raza_id")
);

-- CreateTable
CREATE TABLE "mascotas" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "nombre" VARCHAR(100) NOT NULL,
    "raza_id" INTEGER,
    "sexo" CHAR(1),
    "color_primario" VARCHAR(50),
    "rasgos_particulares" TEXT,
    "estado" "EstadoMascota" NOT NULL DEFAULT 'en_casa',
    "creado_el" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mascotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propietarios_mascota" (
    "persona_id" UUID NOT NULL,
    "mascota_id" UUID NOT NULL,
    "tipo_relacion" "RelacionPropietario" NOT NULL DEFAULT 'Dueño Principal',
    "recibe_alertas" BOOLEAN NOT NULL DEFAULT true,
    "mostrar_en_qr" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "propietarios_mascota_pkey" PRIMARY KEY ("persona_id","mascota_id")
);

-- CreateTable
CREATE TABLE "fichas_medicas" (
    "ficha_id" SERIAL NOT NULL,
    "mascota_id" UUID NOT NULL,
    "alergias" TEXT,
    "enfermedades_cronicas" TEXT,
    "medicacion_diaria" TEXT,
    "tipo_sangre" VARCHAR(10),
    "notas_veterinarias" TEXT,

    CONSTRAINT "fichas_medicas_pkey" PRIMARY KEY ("ficha_id")
);

-- CreateTable
CREATE TABLE "fotos_mascota" (
    "foto_id" SERIAL NOT NULL,
    "mascota_id" UUID NOT NULL,
    "foto_url" TEXT NOT NULL,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "creado_el" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_mascota_pkey" PRIMARY KEY ("foto_id")
);

-- CreateTable
CREATE TABLE "placas_qr" (
    "placa_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "mascota_id" UUID,
    "token_acceso" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "esta_activa" BOOLEAN NOT NULL DEFAULT true,
    "fecha_activacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placas_qr_pkey" PRIMARY KEY ("placa_id")
);

-- CreateTable
CREATE TABLE "zonas_seguras" (
    "zona_id" SERIAL NOT NULL,
    "mascota_id" UUID NOT NULL,
    "nombre_zona" VARCHAR(100),
    "geometria" geometry(Polygon, 4326) NOT NULL,
    "esta_activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "zonas_seguras_pkey" PRIMARY KEY ("zona_id")
);

-- CreateTable
CREATE TABLE "historial_ubicaciones" (
    "log_id" BIGINT NOT NULL,
    "usuario_id" UUID,
    "posicion" geometry(Point, 4326) NOT NULL,
    "fecha_hora" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_ubicaciones_pkey" PRIMARY KEY ("log_id","fecha_hora")
);

-- CreateTable
CREATE TABLE "reportes_extravio" (
    "reporte_id" SERIAL NOT NULL,
    "mascota_id" UUID NOT NULL,
    "fecha_perdida" TIMESTAMPTZ NOT NULL,
    "ultima_ubicacion_conocida" geometry(Point, 4326),
    "recompensa" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "estado_reporte" VARCHAR(20) NOT NULL DEFAULT 'abierto',

    CONSTRAINT "reportes_extravio_pkey" PRIMARY KEY ("reporte_id")
);

-- CreateTable
CREATE TABLE "avistamientos" (
    "avistamiento_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "mascota_id" UUID NOT NULL,
    "ubicacion_gps" geometry(Point, 4326) NOT NULL,
    "mensaje_rescatista" TEXT,
    "foto_evidencia_url" TEXT,
    "fecha_avistamiento" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avistamientos_pkey" PRIMARY KEY ("avistamiento_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personas_ci_key" ON "personas"("ci");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_electronico_key" ON "usuarios"("correo_electronico");

-- CreateIndex
CREATE UNIQUE INDEX "fichas_medicas_mascota_id_key" ON "fichas_medicas"("mascota_id");

-- CreateIndex
CREATE UNIQUE INDEX "placas_qr_mascota_id_key" ON "placas_qr"("mascota_id");

-- CreateIndex
CREATE UNIQUE INDEX "placas_qr_token_acceso_key" ON "placas_qr"("token_acceso");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medios_contacto" ADD CONSTRAINT "medios_contacto_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mascotas" ADD CONSTRAINT "mascotas_raza_id_fkey" FOREIGN KEY ("raza_id") REFERENCES "razas"("raza_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propietarios_mascota" ADD CONSTRAINT "propietarios_mascota_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propietarios_mascota" ADD CONSTRAINT "propietarios_mascota_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_medicas" ADD CONSTRAINT "fichas_medicas_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_mascota" ADD CONSTRAINT "fotos_mascota_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placas_qr" ADD CONSTRAINT "placas_qr_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zonas_seguras" ADD CONSTRAINT "zonas_seguras_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_ubicaciones" ADD CONSTRAINT "historial_ubicaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_extravio" ADD CONSTRAINT "reportes_extravio_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avistamientos" ADD CONSTRAINT "avistamientos_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
