import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { redactUrl } from './redact';

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
        // `redactUrl`, not `originalUrl`: a caller can put a bearer token in a
        // query string, and this is the one place caller-controlled text reaches
        // a log verbatim. It strips sensitive parameters and inline URL
        // credentials. No headers and no body are logged, so `Authorization` and
        // `Cookie` cannot appear here at all.
        url: redactUrl(req.originalUrl),
        status: res.statusCode,
        durationMs,
        userAgent: req.headers['user-agent'] ?? undefined,
      });
      level(`${line}`);
    });

    next();
  }
}