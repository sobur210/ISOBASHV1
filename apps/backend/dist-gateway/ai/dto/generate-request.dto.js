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
exports.GenerateRequestDto = void 0;
const class_validator_1 = require("class-validator");
const CAPABILITIES = ['language', 'vision', 'embeddings', 'image-generation', 'video-generation', 'research'];
const MODES = ['online', 'offline', 'hybrid'];
class GenerateRequestDto {
}
exports.GenerateRequestDto = GenerateRequestDto;
__decorate([
    (0, class_validator_1.IsIn)(CAPABILITIES, { message: 'capability must be one of: language, vision, embeddings, image-generation, video-generation, research' }),
    __metadata("design:type", String)
], GenerateRequestDto.prototype, "capability", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'input must not be empty' }),
    (0, class_validator_1.MaxLength)(100_000, { message: 'input exceeds 100,000 characters' }),
    __metadata("design:type", String)
], GenerateRequestDto.prototype, "input", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], GenerateRequestDto.prototype, "model", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(MODES, { message: 'mode must be one of: online, offline, hybrid' }),
    __metadata("design:type", String)
], GenerateRequestDto.prototype, "mode", void 0);
//# sourceMappingURL=generate-request.dto.js.map