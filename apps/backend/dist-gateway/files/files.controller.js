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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCEPTED_UPLOAD_TYPES = exports.FilesController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const rate_limit_guard_1 = require("../security/rate-limit.guard");
const audit_service_1 = require("../security/audit.service");
const feature_flags_1 = require("../shared/config/feature-flags");
const files_service_1 = require("./files.service");
const file_kinds_1 = require("./file-kinds");
let FilesController = class FilesController {
    files;
    audit;
    constructor(files, audit) {
        this.files = files;
        this.audit = audit;
    }
    capabilities() {
        return this.files.capabilities();
    }
    list(user, status, kind, projectId, limit) {
        return this.files.list(user.id, {
            ...(status ? { status } : {}),
            ...(kind ? { kind } : {}),
            ...(projectId !== undefined ? { projectId: Number(projectId) } : {}),
            ...(limit ? { limit: Number(limit) } : {}),
        });
    }
    get(user, id) {
        return this.files.get(user.id, id);
    }
    text(user, id, limit) {
        return this.files.text(user.id, id, limit ? Number(limit) : undefined);
    }
    async download(user, id, res) {
        const { file } = await this.files.download(user.id, id);
        res.setHeader('content-type', file.mimeType);
        res.setHeader('content-length', String(file.bytes.byteLength));
        res.setHeader('content-disposition', `attachment; filename="${asciiFileName(file.name)}"`);
        res.setHeader('x-content-type-options', 'nosniff');
        res.end(file.bytes);
    }
    async upload(user, file, body) {
        if (!file) {
            throw new common_1.BadRequestException('A file field named "file" is required.');
        }
        const projectId = parseProjectId(body.projectId);
        const stored = await this.files.accept(user.id, {
            originalName: file.originalname,
            declaredMimeType: file.mimetype,
            bytes: file.buffer,
            projectId,
        });
        await this.audit.log({
            category: 'SECURITY',
            action: 'file_uploaded',
            actorId: user.id,
            actorEmail: user.email,
            metadata: {
                fileId: stored?.id,
                name: file.originalname,
                bytes: file.size,
                kind: stored?.kind,
                status: stored?.status,
            },
        });
        return stored;
    }
    async reindex(user, id, body) {
        return this.files.reindex(user.id, id, body?.projectId);
    }
    async remove(user, id) {
        await this.files.remove(user.id, id);
        await this.audit.log({
            category: 'SECURITY',
            action: 'file_deleted',
            actorId: user.id,
            actorEmail: user.email,
            metadata: { fileId: id },
        });
    }
};
exports.FilesController = FilesController;
__decorate([
    (0, common_1.Get)('capabilities'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "capabilities", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('kind')),
    __param(3, (0, common_1.Query)('projectId')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':id/text'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "text", null);
__decorate([
    (0, common_1.Get)(':id/download'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "download", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 30, windowMs: 15 * 60 * 1000 }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        // Bytes are buffered in memory, so the ceiling is enforced while the body is
        // still being read rather than after it has been fully received. Nest
        // translates multer's LIMIT_FILE_SIZE into a 413.
        limits: { files: 1, fields: 10, fileSize: uploadCeiling() },
    })),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "upload", null);
__decorate([
    (0, common_1.Post)(':id/reindex'),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 30, windowMs: 15 * 60 * 1000 }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "reindex", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "remove", null);
exports.FilesController = FilesController = __decorate([
    (0, common_1.Controller)('files'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard, feature_flags_1.FeatureGuard),
    (0, feature_flags_1.RequireFeature)('files'),
    __metadata("design:paramtypes", [files_service_1.FilesService,
        audit_service_1.AuditService])
], FilesController);
/**
 * The interceptor is configured at decoration time, before dependency injection
 * exists, so the ceiling is read from the environment the same way the
 * configuration loader reads it. The service re-checks the real configured
 * value; this is only the early stop.
 */
function uploadCeiling() {
    const configured = Number(process.env.FILES_MAX_BYTES);
    if (Number.isInteger(configured) && configured >= 1024) {
        return configured;
    }
    return 10 * 1024 * 1024;
}
function parseProjectId(value) {
    if (value === undefined || value === '')
        return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new common_1.BadRequestException('projectId must be a positive integer.');
    }
    return parsed;
}
/**
 * `content-disposition` only accepts a plain token safely, so anything exotic is
 * quoted out rather than trusted to the client's parser.
 */
function asciiFileName(name) {
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return ascii.length > 0 ? ascii : 'download';
}
exports.ACCEPTED_UPLOAD_TYPES = file_kinds_1.SUPPORTED_EXTENSIONS;
//# sourceMappingURL=files.controller.js.map