import { NestFactory } from '@nestjs/core';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useWebSocketAdapter(new IoAdapter(app));

  // Captura errores de Prisma antes de que lleguen como 500 al cliente
  app.useGlobalFilters(new PrismaExceptionFilter());

  app.enableCors();
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const formatErrors = (
          errs: ValidationError[],
          parentPath = '',
        ): Record<string, string[]> => {
          const result: Record<string, string[]> = {};
          for (const err of errs) {
            const path = parentPath ? `${parentPath}.${err.property}` : err.property;
            if (err.constraints) result[path] = Object.values(err.constraints);
            if (err.children?.length) Object.assign(result, formatErrors(err.children, path));
          }
          return result;
        };

        return new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Error de validación',
          errores: formatErrors(errors),
        });
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('PetFinder API')
    .setDescription('Ecosistema telemático para la gestión de mascotas perdidas')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Render y otros PaaS inyectan PORT y requieren bind a 0.0.0.0
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 El servidor de PetFinder está corriendo en el puerto: ${port}`);
  logger.log(`📄 Documentación Swagger disponible en: /api/docs`);
  logger.log(`🔌 WebSocket activo en: /realtime`);
}

void bootstrap().catch((err) => {
  console.error('Error durante el inicio de la aplicación:', err);
  process.exit(1);
});
