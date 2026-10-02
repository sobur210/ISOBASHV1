import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
/**
 * Bounded `$connect()` on boot.
 *
 * Prisma retries the initial handshake, so against an unreachable PostgreSQL the
 * promise can stay pending long enough that Nest never finishes `init()` and the
 * HTTP port is never bound (API silently unreachable, no error in the log).
 * We bound the wait, log the real failure, and boot degraded: `/health` then
 * reports `database: error` truthfully instead of the process hanging.
 */
export declare class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    onModuleInit(): Promise<void>;
    private connect;
    onModuleDestroy(): Promise<void>;
}
