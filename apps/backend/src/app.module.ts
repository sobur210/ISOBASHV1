import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppGateway } from './app.gateway';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queues/queue.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    QueueModule,
    AiModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, AppGateway],
})
export class AppModule {}
