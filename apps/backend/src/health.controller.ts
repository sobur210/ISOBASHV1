import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getLiveness() {
    return {
      status: 'ok',
      service: 'isobash-api',
      timestamp: new Date().toISOString(),
    };
  }
}
