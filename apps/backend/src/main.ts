import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadConfig } from './shared/config/configuration';

async function bootstrap() {
  const config = loadConfig();

  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  // Credentials are allowed, so the allowed origins are an explicit list rather
  // than a reflected one. An unlisted origin is refused outright, and a request
  // that is allowed still gets the exact configured value back.
  const allowed = new Set(config.corsOrigins);
  app.enableCors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowed.has(origin));
    },
  });

  app.enableShutdownHooks();

  await app.listen(config.port);
  const logger = new Logger('Bootstrap');
  logger.log(`ISOBASH API listening on ${config.apiUrl}`);
  logger.log(`CORS origins: ${config.corsOrigins.join(', ') || '(none)'}`);
  logger.log(`Runtime data root: ${config.storage.dataRoot}`);
}
bootstrap();