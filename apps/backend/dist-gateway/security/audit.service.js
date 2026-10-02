"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let AuditService = class AuditService {
    prisma;
    logger = new common_1.Logger('Audit');
    constructor(prisma) {
        this.prisma = prisma;
    }
    async log(input) {
        try {
            await this.prisma.auditEvent.create({
                data: {
                    category: input.category,
                    action: input.action,
                    actorId: input.actorId ?? null,
                    actorEmail: input.actorEmail ?? null,
                    ip: input.ip ?? null,
                    userAgent: input.userAgent ?? null,
                    metadata: input.metadata ? input.metadata : undefined,
                },
            });
        }
        catch (error) {
            this.logger.warn(`Audit write failed for ${input.action}: ${error instanceof Error ? error.message : error}`);
        }
    }
    fromRequest(req) {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.ip || 'unknown';
        const userAgent = req.headers['user-agent']?.slice(0, 500);
        return { ip, userAgent: userAgent || undefined };
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditService);
//# sourceMappingURL=audit.service.js.map