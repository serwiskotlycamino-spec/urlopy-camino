import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsRaw = process.env.CORS_ORIGINS?.trim();

  if (!corsRaw || corsRaw === '*') {
    app.enableCors({
      origin: true,
      credentials: false,
    });
  } else {
    const corsOrigins = corsRaw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    app.enableCors({
      origin: corsOrigins,
      credentials: false,
    });
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap().catch((error: unknown) => {
  console.error('API bootstrap failed', error);
  process.exit(1);
});
