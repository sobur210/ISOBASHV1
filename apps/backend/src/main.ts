import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadConfig } from './shared/config/configuration';

async function bootstrap() {
  const config = loadConfig();

  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableShutdownHooks();

  await app.listen(config.port);
  const logger = new Logger('Bootstrap');
  logger.log(`ISOBASH API listening on ${config.apiUrl}`);
  logger.log(`Runtime data root: ${config.storage.dataRoot}`);
}
bootstrap();