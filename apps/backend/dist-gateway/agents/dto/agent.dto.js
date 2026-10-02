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
exports.StartAgentRunDto = exports.UpdateAgentDto = exports.CreateAgentDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const strict_boolean_decorator_1 = require("../../shared/dto/strict-boolean.decorator");
const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;
const MAX_INSTRUCTIONS = 8000;
const MAX_TOOLS = 12;
const MAX_STEPS = 12;
class CreateAgentDto {
    name;
    description;
    instructions;
    /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
    providerModel;
    maxSteps;
    toolNames;
    memoryEnabled;
    projectId;
}
exports.CreateAgentDto = CreateAgentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(MAX_NAME),
    __metadata("design:type", String)
], CreateAgentDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(MAX_DESCRIPTION),
    __metadata("design:type", String)
], CreateAgentDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(MAX_INSTRUCTIONS),
    __metadata("design:type", String)
], CreateAgentDto.prototype, "instructions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateAgentDto.prototype, "providerModel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(MAX_STEPS),
    __metadata("design:type", Number)
], CreateAgentDto.prototype, "maxSteps", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateAgentDto.prototype, "toolNames", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, strict_boolean_decorator_1.StrictBoolean)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Object)
], CreateAgentDto.prototype, "memoryEnabled", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateAgentDto.prototype, "projectId", void 0);
class UpdateAgentDto {
    name;
    description;
    instructions;
    providerModel;
    maxSteps;
    toolNames;
    memoryEnabled;
    projectId;
}
exports.UpdateAgentDto = UpdateAgentDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(MAX_NAME),
    __metadata("design:type", String)
], UpdateAgentDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(MAX_DESCRIPTION),
    __metadata("design:type", String)
], UpdateAgentDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(MAX_INSTRUCTIONS),
    __metadata("design:type", String)
], UpdateAgentDto.prototype, "instructions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateAgentDto.prototype, "providerModel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(MAX_STEPS),
    __metadata("design:type", Number)
], UpdateAgentDto.prototype, "maxSteps", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateAgentDto.prototype, "toolNames", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, strict_boolean_decorator_1.StrictBoolean)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Object)
], UpdateAgentDto.prototype, "memoryEnabled", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Object)
], UpdateAgentDto.prototype, "projectId", void 0);
class StartAgentRunDto {
    input;
}
exports.StartAgentRunDto = StartAgentRunDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(8000),
    __metadata("design:type", String)
], StartAgentRunDto.prototype, "input", void 0);
//# sourceMappingURL=agent.dto.js.map