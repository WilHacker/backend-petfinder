-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('usuario', 'admin');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "refresh_token_hash" TEXT,
ADD COLUMN     "rol" "rol_usuario" NOT NULL DEFAULT 'usuario';
