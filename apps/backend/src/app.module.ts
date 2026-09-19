import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppGateway } from './app.gateway';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queues/queue.module';
import { AiModule } from './ai/ai.module';
import { ConfigModule as IsoConfigModule, loadConfiguredConfig } from './shared/config/config.module';
import { resolveEnvFile } from './shared/config/configuration';
import { StorageModule } from './shared/storage/storage.module';
import { RequestLoggingMiddleware } from './shared/logging/request-logging.middleware';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFile(),
    }),
    IsoConfigModule,
    StorageModule,
    PrismaModule,
    QueueModule,
    AiModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    AppGateway,
    HealthService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}