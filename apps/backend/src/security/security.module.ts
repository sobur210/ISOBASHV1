import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CONFIG } from '../shared/config/config.module';
import { AppConfig } from '../shared/config/configuration';
import { AuditService } from './audit.service';
import { RateLimitService } from './rate-limit.service';
import { RateLimitGuard } from './rate-limit.guard';
import { SecretCipher } from './secret-cipher';

@Module({
  imports: [PrismaModule],
  providers: [
    AuditService,
    RateLimitService,
    RateLimitGuard,
    {
      provide: SecretCipher,
      useFactory: (config: AppConfig) => new SecretCipher(config.security.appSecret),
      inject: [CONFIG],
    },
  ],
  exports: [AuditService, RateLimitService, RateLimitGuard, SecretCipher],
})
export class SecurityModule {}