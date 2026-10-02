import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queues/queue.module';
import { AiModule } from './ai/ai.module';
import { ChatModule } from './chat/chat.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AgentsModule } from './agents/agents.module';
import { ResearchModule } from './research/research.module';
import { FilesModule } from './files/files.module';
import { MediaModule } from './media/media.module';
import { VideoAssemblyModule } from './media/video-assembly.module';
import { MemoryModule } from './memory/memory.module';
import { ProjectsModule } from './projects/projects.module';
import { BillingModule } from './billing/billing.module';
import { ConfigModule as IsoConfigModule } from './shared/config/config.module';
import { resolveEnvFile } from './shared/config/configuration';
import { StorageModule } from './shared/storage/storage.module';
import { RequestLoggingMiddleware } from './shared/logging/request-logging.middleware';
import { SecurityHeadersMiddleware } from './security/security-headers.middleware';

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
    ChatModule,
    AuthModule,
    AdminModule,
    RealtimeModule,
    MemoryModule,
    ProjectsModule,
    AgentsModule,
    ResearchModule,
    FilesModule,
    MediaModule,
    BillingModule,
    VideoAssemblyModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
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
    consumer.apply(RequestLoggingMiddleware, SecurityHeadersMiddleware).forRoutes('*');
  }
}

