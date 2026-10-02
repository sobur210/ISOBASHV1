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
exports.MediaController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const rate_limit_guard_1 = require("../security/rate-limit.guard");
const audit_service_1 = require("../security/audit.service");
const strict_boolean_decorator_1 = require("../shared/dto/strict-boolean.decorator");
const media_dto_1 = require("./dto/media.dto");
const image_generation_service_1 = require("./image-generation.service");
const video_generation_service_1 = require("./video-generation.service");
const media_service_1 = require("./media.service");
let MediaController = class MediaController {
    media;
    generation;
    videoGeneration;
    audit;
    constructor(media, generation, videoGeneration, audit) {
        this.media = media;
        this.generation = generation;
        this.videoGeneration = videoGeneration;
        this.audit = audit;
    }
    /** What image generation can actually do right now, including the last real failure. */
    capabilities(user) {
        return this.media.capabilities(user.id);
    }
    listGenerations(user, status, projectId, limit) {
        return this.media.listGenerations(user.id, {
            ...(status ? { status } : {}),
            ...(projectId !== undefined ? { projectId: Number(projectId) } : {}),
            ...(limit ? { limit: Number(limit) } : {}),
        });
    }
    async start(user, body) {
        const generation = await this.media.start(user, {
            prompt: body.prompt,
            ...(body.style ? { style: body.style } : {}),
            ...((0, strict_boolean_decorator_1.strictBooleanValue)(body.enhance) !== undefined
                ? { enhance: (0, strict_boolean_decorator_1.strictBooleanValue)(body.enhance) }
                : {}),
            ...(body.aspectRatio ? { aspectRatio: body.aspectRatio } : {}),
            ...(body.count !== undefined ? { count: body.count } : {}),
            ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
            ...(body.model ? { model: body.model } : {}),
        });
        await this.audit.log({
            category: 'SECURITY',
            action: 'image_generation_requested',
            actorId: user.id,
            actorEmail: user.email,
            metadata: {
                generationId: generation.id,
                aspectRatio: generation.aspectRatio,
                count: generation.requestedCount,
                ...(generation.style ? { style: generation.style } : {}),
                ...(body.enhance ? { enhanced: true } : {}),
            },
        });
        return generation;
    }
    getGeneration(user, id) {
        return this.media.getGeneration(user.id, id);
    }
    cancel(user, id) {
        return this.generation.cancel(user.id, id);
    }
    async removeGeneration(user, id) {
        await this.media.removeGeneration(user.id, id);
    }
    listVideoGenerations(user, status, projectId, limit) {
        return this.media.listVideoGenerations(user.id, {
            ...(status ? { status } : {}),
            ...(projectId !== undefined ? { projectId: Number(projectId) } : {}),
            ...(limit ? { limit: Number(limit) } : {}),
        });
    }
    /**
     * One clip per request. The rate limit is far lower than the image route's
     * because a render holds a provider connection open for minutes: twenty at once
     * would be twenty of them, not twenty quick answers.
     */
    async startVideo(user, body) {
        const generation = await this.media.startVideo(user, {
            prompt: body.prompt,
            ...(body.aspectRatio ? { aspectRatio: body.aspectRatio } : {}),
            ...(body.seconds !== undefined ? { seconds: body.seconds } : {}),
            ...((0, strict_boolean_decorator_1.strictBooleanValue)(body.audio) !== undefined
                ? { audio: (0, strict_boolean_decorator_1.strictBooleanValue)(body.audio) }
                : {}),
            ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
            ...(body.model ? { model: body.model } : {}),
            ...(body.sourceAssetId ? { sourceAssetId: body.sourceAssetId } : {}),
        });
        await this.audit.log({
            category: 'SECURITY',
            action: 'video_generation_requested',
            actorId: user.id,
            actorEmail: user.email,
            metadata: {
                generationId: generation.id,
                seconds: generation.requestedSeconds,
                aspectRatio: generation.aspectRatio,
                // The first frame is named, not uploaded: knowing a frame left the app
                // matters when reading the audit trail.
                imageToVideo: generation.sourceAssetId !== null,
            },
        });
        return generation;
    }
    getVideoGeneration(user, id) {
        return this.media.getVideoGeneration(user.id, id);
    }
    cancelVideo(user, id) {
        return this.videoGeneration.cancel(user.id, id);
    }
    async removeVideoGeneration(user, id) {
        await this.media.removeVideoGeneration(user.id, id);
    }
    listAssets(user, kind, generationId, projectId, limit) {
        return this.media.listAssets(user.id, {
            ...(kind ? { kind } : {}),
            ...(generationId ? { generationId } : {}),
            ...(projectId !== undefined ? { projectId: Number(projectId) } : {}),
            ...(limit ? { limit: Number(limit) } : {}),
        });
    }
    getAsset(user, id) {
        return this.media.getAsset(user.id, id);
    }
    /**
     * The bytes. Authenticated, owner-scoped and checksum-verified, and served with
     * `nosniff` so the browser cannot be talked into treating a clip as a document.
     *
     * Range requests are answered for real: a `<video>` element that gets a 200 with
     * the whole file cannot seek, and a clip the user cannot scrub through is a worse
     * deliverable than the bytes on disk.
     */
    async file(user, id, res, download, range) {
        const { asset, bytes } = await this.media.readAsset(user.id, id);
        const extension = extensionForMime(asset.mimeType);
        res.setHeader('content-type', asset.mimeType);
        res.setHeader('x-content-type-options', 'nosniff');
        res.setHeader('cache-control', 'private, max-age=0, no-store');
        /**
         * The app renders these bytes from its own origin, which is a different port
         * and therefore cross-origin, so the global `same-origin` resource policy
         * would block every thumbnail and every clip. `same-site` keeps the route
         * unreachable from anywhere else, and the session cookie is what authorises it.
         */
        res.setHeader('cross-origin-resource-policy', 'same-site');
        const disposition = download !== undefined ? 'attachment' : 'inline';
        res.setHeader('content-disposition', `${disposition}; filename="${asciiFileName(`${id}.${extension}`)}"`);
        const window = range ? parseRange(range, bytes.byteLength) : null;
        if (range && !window) {
            res.setHeader('content-range', `bytes */${bytes.byteLength}`);
            res.status(416).end();
            return;
        }
        if (window) {
            res.status(206);
            res.setHeader('content-range', `bytes ${window.start}-${window.end}/${bytes.byteLength}`);
            res.setHeader('content-length', String(window.end - window.start + 1));
            res.setHeader('accept-ranges', 'bytes');
            res.end(bytes.subarray(window.start, window.end + 1));
            return;
        }
        res.setHeader('content-length', String(bytes.byteLength));
        if (asset.kind === 'VIDEO')
            res.setHeader('accept-ranges', 'bytes');
        res.end(bytes);
    }
    async removeAsset(user, id) {
        await this.media.removeAsset(user.id, id);
        await this.audit.log({
            category: 'SECURITY',
            action: 'media_deleted',
            actorId: user.id,
            actorEmail: user.email,
            metadata: { assetId: id },
        });
    }
};
exports.MediaController = MediaController;
__decorate([
    (0, common_1.Get)('capabilities'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "capabilities", null);
__decorate([
    (0, common_1.Get)('generations'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('projectId')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "listGenerations", null);
__decorate([
    (0, common_1.Post)('generations'),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 20, windowMs: 15 * 60 * 1000 }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, media_dto_1.CreateImageGenerationDto]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "start", null);
__decorate([
    (0, common_1.Get)('generations/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "getGeneration", null);
__decorate([
    (0, common_1.Post)('generations/:id/cancel'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "cancel", null);
__decorate([
    (0, common_1.Delete)('generations/:id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "removeGeneration", null);
__decorate([
    (0, common_1.Get)('video-generations'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('projectId')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "listVideoGenerations", null);
__decorate([
    (0, common_1.Post)('video-generations'),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 6, windowMs: 15 * 60 * 1000 }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, media_dto_1.CreateVideoGenerationDto]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "startVideo", null);
__decorate([
    (0, common_1.Get)('video-generations/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "getVideoGeneration", null);
__decorate([
    (0, common_1.Post)('video-generations/:id/cancel'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "cancelVideo", null);
__decorate([
    (0, common_1.Delete)('video-generations/:id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "removeVideoGeneration", null);
__decorate([
    (0, common_1.Get)('assets'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('kind')),
    __param(2, (0, common_1.Query)('generationId')),
    __param(3, (0, common_1.Query)('projectId')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "listAssets", null);
__decorate([
    (0, common_1.Get)('assets/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "getAsset", null);
__decorate([
    (0, common_1.Get)('assets/:id/file'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __param(3, (0, common_1.Query)('download')),
    __param(4, (0, common_1.Headers)('range')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String, String]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "file", null);
__decorate([
    (0, common_1.Delete)('assets/:id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "removeAsset", null);
exports.MediaController = MediaController = __decorate([
    (0, common_1.Controller)('media'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [media_service_1.MediaService,
        image_generation_service_1.ImageGenerationService,
        video_generation_service_1.VideoGenerationService,
        audit_service_1.AuditService])
], MediaController);
function extensionForMime(mimeType) {
    switch (mimeType) {
        case 'image/jpeg':
            return 'jpg';
        case 'image/gif':
            return 'gif';
        case 'image/webp':
            return 'webp';
        case 'video/mp4':
            return 'mp4';
        case 'video/quicktime':
            return 'mov';
        case 'video/webm':
            return 'webm';
        case 'video/x-matroska':
            return 'mkv';
        default:
            return 'png';
    }
}
/**
 * Parse a single `bytes=start-end` range against a known length.
 *
 * Only the one-range form is honoured. A multi-range request answers with the whole
 * file rather than a `multipart/byteranges` body, which is a legal response and one
 * this route has no reason to build; a malformed or unsatisfiable range returns null
 * so the caller can answer 416 instead of quietly sending the wrong slice.
 */
function parseRange(header, total) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match)
        return null;
    const [, rawStart, rawEnd] = match;
    if (rawStart === '' && rawEnd === '')
        return null;
    let start;
    let end;
    if (rawStart === '') {
        // `-N` asks for the last N bytes.
        const suffix = Number(rawEnd);
        if (!Number.isInteger(suffix) || suffix <= 0)
            return null;
        start = Math.max(0, total - suffix);
        end = total - 1;
    }
    else {
        start = Number(rawStart);
        end = rawEnd === '' ? total - 1 : Number(rawEnd);
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= total || end < start)
        return null;
    return { start, end: Math.min(end, total - 1) };
}
/**
 * `content-disposition` only accepts a plain token safely, so the name is built
 * from the server-generated id and quoted out rather than trusted to the client.
 */
function asciiFileName(name) {
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return ascii.length > 0 ? ascii : 'image';
}
//# sourceMappingURL=media.controller.js.map