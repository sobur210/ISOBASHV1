import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfig, ensureStorageRoots, loadConfig } from './configuration';
import { AllExceptionsFilter } from '../errors/all-exceptions.filter';

export const CONFIG = 'CONFIG';

export function loadConfiguredConfig(): AppConfig {
  const config = loadConfig();
  ensureStorageRoots(config);
  return config;
}

@Global()
@Module({
  providers: [
    {
      provide: CONFIG,
      useFactory: loadConfiguredConfig,
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [CONFIG],
})
export class ConfigModule {}