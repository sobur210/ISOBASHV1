import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const CONNECT_TIMEOUT_MS = Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 15_000);

/**
 * Bounded `$connect()` on boot.
 *
 * Prisma retries the initial handshake, so against an unreachable PostgreSQL the
 * promise can stay pending long enough that Nest never finishes `init()` and the
 * HTTP port is never bound (API silently unreachable, no error in the log).
 * We bound the wait, log the real failure, and boot degraded: `/health` then
 * reports `database: error` truthfully instead of the process hanging.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  async onModuleInit() {
    try {
      await this.connect();
      this.logger.log('Database connection ready');
    } catch (error) {
      this.logger.error(
        `Database is not reachable at startup: ${error instanceof Error ? error.message : String(error)}. ` +
          'The API will start in a degraded state; database-backed routes will fail until PostgreSQL is running.',
      );
    }
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`no connection within ${CONNECT_TIMEOUT_MS}ms`));
      }, CONNECT_TIMEOUT_MS);
      this.$connect()
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {
      // The connection may never have been established; nothing to close.
    }
  }
}
