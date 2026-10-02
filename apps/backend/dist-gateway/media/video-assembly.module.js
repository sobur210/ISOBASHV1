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
exports.VideoAssemblyModule = exports.VideoAssemblyController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const audit_service_1 = require("../security/audit.service");
const rate_limit_guard_1 = require("../security/rate-limit.guard");
const json2video_provider_1 = require("../ai/json2video.provider");
const auth_module_1 = require("../auth/auth.module");
const security_module_1 = require("../security/security.module");
const config_module_1 = require("../shared/config/config.module");
const storage_module_1 = require("../shared/storage/storage.module");
const assembly_dto_1 = require("./dto/assembly.dto");
const video_assembly_service_1 = require("./video-assembly.service");
/**
 * `POST /media/assembly`, mounted on its own path.
 *
 * Deliberately a different route from `/media/video-generations`. Sharing a
 * controller and a path prefix would have been less code, and it would also have
 * made an assembled slideshow and a generated clip indistinguishable to any client
 * that guessed the URL. Separate routes mean the UI can offer them as the two
 * different things they are, and neither can be reached by replaying the other's
 * request body.
 *
 * The controller stays thin: validate, call the service, audit. The rate limit is
 * 6 per hour per account rather than the 20 per 15 minutes video generation allows,
 * because each assembly is minutes of provider time against a grant of 600 seconds
 * that does not refill, so the ceiling is a budget question and not a load one.
 */
let VideoAssemblyController = class VideoAssemblyController {
    assembly;
    audit;
    constructor(assembly, audit) {
        this.assembly = assembly;
        this.audit = audit;
    }
    async capabilities() {
        return this.assembly.capabilities();
    }
    async start(user, body) {
        const result = await this.assembly.start(user.id, body.projectId ?? null, body);
        await this.audit.log({
            category: 'SECURITY',
            action: 'video_assembly_requested',
            actorId: user.id,
            actorEmail: user.email,
            /**
             * The title is included because the audit trail has to be able to answer
             * "what did this account turn into a video, and when", but the scenes are
             * not: the body of a report is the user's private content and the assembly
             * row already holds the recipe that made it.
             */
            metadata: {
                provider: this.assembly.providerName(),
                source: body.source,
                sourceId: body.sourceId ?? null,
                title: body.title,
                resolution: body.resolution,
                voiceover: body.voiceover === true,
                durationMs: result.asset.durationMs,
                assetId: result.asset.id,
                projectId: result.projectId,
            },
        });
        return result;
    }
};
exports.VideoAssemblyController = VideoAssemblyController;
__decorate([
    (0, common_1.Get)('capabilities'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], VideoAssemblyController.prototype, "capabilities", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 6, windowMs: 60 * 60 * 1000 }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, assembly_dto_1.CreateAssemblyDto]),
    __metadata("design:returntype", Promise)
], VideoAssemblyController.prototype, "start", null);
exports.VideoAssemblyController = VideoAssemblyController = __decorate([
    (0, common_1.Controller)('media/assembly'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [video_assembly_service_1.VideoAssemblyService,
        audit_service_1.AuditService])
], VideoAssemblyController);
/**
 * A separate module, for the same reason the route is separate.
 *
 * `JSON2VIDEO_ENABLED` gates whether the provider can do anything at all, so this
 * module being imported by the app root does not mean assembly is on. Gating the
 * controller rather than the module keeps the wiring visible: an operator sees the
 * endpoint in the route table and gets a clear refusal, instead of a 404 that looks
 * like a typo. The provider reports `unconfigured` with an explanatory detail when
 * no key is set, which the UI shows as the reason the button is unavailable.
 */
let VideoAssemblyModule = class VideoAssemblyModule {
};
exports.VideoAssemblyModule = VideoAssemblyModule;
exports.VideoAssemblyModule = VideoAssemblyModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, config_module_1.ConfigModule, security_module_1.SecurityModule, storage_module_1.StorageModule],
        controllers: [VideoAssemblyController],
        providers: [video_assembly_service_1.VideoAssemblyService, json2video_provider_1.Json2VideoProvider],
        exports: [video_assembly_service_1.VideoAssemblyService],
    })
], VideoAssemblyModule);
//# sourceMappingURL=video-assembly.module.js.map