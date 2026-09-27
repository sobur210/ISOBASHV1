import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RateLimitService } from './rate-limit.service';

export const RATE_LIMIT_KEY = 'rateLimit';

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const forwarded = request.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || request.ip || 'unknown';
    const bucket = `auth:${request.method}:${request.path.split('?')[0]}:${ip}:${options.limit}:${options.windowMs}`;

    const result = await this.rateLimit.hit(bucket, options.limit, options.windowMs);
    response.setHeader('x-ratelimit-limit', String(options.limit));
    response.setHeader(
      'x-ratelimit-remaining',
      String(result.remaining),
    );
    if (!result.allowed) {
      response.setHeader('retry-after', String(Math.ceil(result.retryAfterMs / 1000)));
      throw new HttpException('Too many requests. Please retry shortly.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}