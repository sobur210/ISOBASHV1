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
exports.CreateVideoGenerationDto = exports.CreateImageGenerationDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const strict_boolean_decorator_1 = require("../../shared/dto/strict-boolean.decorator");
class CreateImageGenerationDto {
    prompt;
    /**
     * A style preset id from `IMAGE_STYLES`. The allow-list is enforced in the
     * service with the real list, so an unknown value is refused rather than
     * silently dropped (which would render an image the caller did not ask for).
     */
    style;
    /**
     * Ask a routed text model to expand the description before rendering. Best
     * effort: the original words are always what the renderer falls back to.
     */
    enhance;
    /** Must be one of `MEDIA_ASPECT_RATIOS`; anything else is refused, not coerced. */
    aspectRatio;
    /**
     * How many variations to render. Each is a separate render with its own seed,
     * so this is a real "give me N different takes" control, not a multiplier on
     * one image.
     */
    count;
    projectId;
    /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
    model;
}
exports.CreateImageGenerationDto = CreateImageGenerationDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateImageGenerationDto.prototype, "prompt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], CreateImageGenerationDto.prototype, "style", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, strict_boolean_decorator_1.StrictBoolean)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Object)
], CreateImageGenerationDto.prototype, "enhance", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['1:1', '3:4', '4:3', '9:16', '16:9']),
    __metadata("design:type", String)
], CreateImageGenerationDto.prototype, "aspectRatio", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(8),
    __metadata("design:type", Number)
], CreateImageGenerationDto.prototype, "count", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateImageGenerationDto.prototype, "projectId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Za-z0-9._:-]{1,80}$/, { message: 'model may only contain letters, digits, dot, underscore, colon and dash.' }),
    __metadata("design:type", String)
], CreateImageGenerationDto.prototype, "model", void 0);
class CreateVideoGenerationDto {
    prompt;
    /** Must be one of `MEDIA_VIDEO_ASPECT_RATIOS`; anything else is refused, not coerced. */
    aspectRatio;
    /** Must be one of `MEDIA_VIDEO_DURATIONS`. */
    seconds;
    audio;
    projectId;
    /**
     * A stored IMAGE asset of this account to animate. Anything else (another
     * user's id, a clip, an id that does not exist) is refused at start time.
     */
    sourceAssetId;
    /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
    model;
}
exports.CreateVideoGenerationDto = CreateVideoGenerationDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateVideoGenerationDto.prototype, "prompt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['16:9', '9:16', '1:1']),
    __metadata("design:type", String)
], CreateVideoGenerationDto.prototype, "aspectRatio", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(120),
    __metadata("design:type", Number)
], CreateVideoGenerationDto.prototype, "seconds", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, strict_boolean_decorator_1.StrictBoolean)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Object)
], CreateVideoGenerationDto.prototype, "audio", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateVideoGenerationDto.prototype, "projectId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateVideoGenerationDto.prototype, "sourceAssetId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Za-z0-9._:/-]{1,120}$/, { message: 'model may only contain letters, digits, dot, underscore, slash, colon and dash.' }),
    __metadata("design:type", String)
], CreateVideoGenerationDto.prototype, "model", void 0);
//# sourceMappingURL=media.dto.js.map