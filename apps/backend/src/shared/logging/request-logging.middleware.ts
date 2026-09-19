import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);
    const started = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - started;
      const level = res.statusCode >= 500 ? this.logger.error.bind(this.logger) : this.logger.log.bind(this.logger);
      const line = JSON.stringify({
        requestId,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs,
        userAgent: req.headers['user-agent'] ?? undefined,
      });
      level(`${line}`);
    });

    next();
  }
}