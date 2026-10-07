import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * The liveness probe. Always 200, and deliberately not the one Render is
   * pointed at: this answers "is this process up", and the process is up even
   * while a dependency is down. A 500 here would make Render kill and restart a
   * healthy API every time a connection to Postgres blipped.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  getLiveness() {
    return this.health.check();
  }

  /**
   * The readiness probe. This is the one a load balancer or Render's health
   * check should use: it fails with 503 when a dependency the API genuinely
   * cannot serve without is unreachable, so traffic is diverted rather than sent
   * into requests that will all error.
   */
  @Get('ready')
  async getReadiness(@Res({ passthrough: true }) res: Response) {
    const report = await this.health.check();
    if (report.status !== 'ok') {
      // `statusCode` alongside the body, because Express only writes a status
      // that a handler set; throwing would replace the diagnostic payload with
      // an error envelope and lose which component actually failed.
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return report;
    }
    return report;
  }
}