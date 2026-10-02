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
exports.CreateAssemblyDto = exports.AssemblySceneDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const strict_boolean_decorator_1 = require("../../shared/dto/strict-boolean.decorator");
const video_assembly_types_1 = require("../../ai/video-assembly.types");
/**
 * Request body for `POST /media/assembly`.
 *
 * The caller supplies the *scenes*, not a prompt. There is no prompt here because
 * there is nothing to infer: a report or summary already has a title, headings and
 * paragraphs, and the feature's job is to lay that out and read it aloud.
 *
 * Every limit below is a plan limit from JSON2Video's free tier (600 credits,
 * 1080p, 60 seconds), not an invented one. The provider refuses an over-long movie
 * and a >2MB body anyway; failing here first means the user finds out before
 * waiting minutes for a render that was never going to succeed.
 */
/**
 * One scene. `@Matches` for a non-empty body instead of `@IsNotEmpty`, because a
 * scene of whitespace produces a provider error naming a field the user never
 * filled in, which is a worse message than a validation one.
 */
class AssemblySceneDto {
    /** Rendered as the scene's heading line. */
    heading;
    /** Narration and on-screen text. JSON2Video charges TTS 0 credits, so this is free to read aloud. */
    body;
}
exports.AssemblySceneDto = AssemblySceneDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.Matches)(/\S/),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], AssemblySceneDto.prototype, "heading", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.Matches)(/\S/),
    (0, class_validator_1.MaxLength)(4000),
    __metadata("design:type", String)
], AssemblySceneDto.prototype, "body", void 0);
class CreateAssemblyDto {
    title;
    subtitle;
    /**
     * Capped at 40 because a single movie cannot exceed 60 seconds and each scene
     * costs at least a few seconds to read. Past this the total is refused on
     * duration, not on a magic number here.
     */
    scenes;
    /**
     * Narration on/off. Uses `StrictBoolean` so `"false"` cannot become `true`:
     * a summary that silently gains a voice is a wrong result, not a cosmetic one.
     */
    voiceover;
    /** Appended as a closing scene, e.g. a source line or a call to action. */
    outro;
    /** Must be one of the plan's sizes; `full-hd` is the free ceiling. */
    resolution;
    /**
     * Where the content came from, recorded on the asset so an assembled video can
     * be traced back to the report or summary it was built from.
     */
    source;
    /** Id of the report or conversation, when there is one. */
    sourceId;
    projectId;
}
exports.CreateAssemblyDto = CreateAssemblyDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateAssemblyDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], CreateAssemblyDto.prototype, "subtitle", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(40),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => AssemblySceneDto),
    __metadata("design:type", Array)
], CreateAssemblyDto.prototype, "scenes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, strict_boolean_decorator_1.StrictBoolean)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Object)
], CreateAssemblyDto.prototype, "voiceover", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], CreateAssemblyDto.prototype, "outro", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(video_assembly_types_1.ASSEMBLY_RESOLUTIONS),
    __metadata("design:type", Object)
], CreateAssemblyDto.prototype, "resolution", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['research', 'chat']),
    __metadata("design:type", String)
], CreateAssemblyDto.prototype, "source", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateAssemblyDto.prototype, "sourceId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(2_147_483_647),
    __metadata("design:type", Number)
], CreateAssemblyDto.prototype, "projectId", void 0);
//# sourceMappingURL=assembly.dto.js.map