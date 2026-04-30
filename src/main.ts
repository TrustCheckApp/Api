import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3001'],
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('TrustCheck API')
    .setDescription('Backend central — AUTH e CASOS — Sprint 1')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const porta = process.env.PORT ?? 3000;
  await app.listen(porta);
  console.log(`TrustCheck API rodando em http://localhost:${porta}`);
  console.log(`Documentação Swagger em http://localhost:${porta}/docs`);
}
bootstrap();
