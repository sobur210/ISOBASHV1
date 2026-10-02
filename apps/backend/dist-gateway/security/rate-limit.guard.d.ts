import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from './rate-limit.service';
export declare const RATE_LIMIT_KEY = "rateLimit";
export type RateLimitOptions = {
    limit: number;
    windowMs: number;
};
export declare const RateLimit: (options: RateLimitOptions) => import("@nestjs/common").CustomDecorator<string>;
export declare class RateLimitGuard implements CanActivate {
    private readonly reflector;
    private readonly rateLimit;
    constructor(reflector: Reflector, rateLimit: RateLimitService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
