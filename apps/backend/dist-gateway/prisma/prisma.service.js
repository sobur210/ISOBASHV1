"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
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
let PrismaService = class PrismaService extends client_1.PrismaClient {
    logger = new common_1.Logger('Prisma');
    async onModuleInit() {
        try {
            await this.connect();
            this.logger.log('Database connection ready');
        }
        catch (error) {
            this.logger.error(`Database is not reachable at startup: ${error instanceof Error ? error.message : String(error)}. ` +
                'The API will start in a degraded state; database-backed routes will fail until PostgreSQL is running.');
        }
    }
    connect() {
        return new Promise((resolve, reject) => {
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
        }
        catch {
            // The connection may never have been established; nothing to close.
        }
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = __decorate([
    (0, common_1.Injectable)()
], PrismaService);
//# sourceMappingURL=prisma.service.js.map