import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.enableCors();
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
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

  // Capturamos el puerto (3000 por defecto)
  const port = process.env.PORT || 3000;
  await app.listen(port);

  // Imprimimos las rutas en la consola
  logger.log(`🚀 El servidor de PetFinder está corriendo en: http://localhost:${port}`);
  logger.log(`📄 Documentación Swagger disponible en: http://localhost:${port}/api/docs`);
}

void bootstrap().catch((err) => {
  console.error('Error durante el inicio de la aplicación:', err);
  process.exit(1);
});
