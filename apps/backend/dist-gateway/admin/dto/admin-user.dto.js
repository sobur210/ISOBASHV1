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
exports.UpdateUserRoleDto = exports.ListUsersQueryDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const MAX_SEARCH = 120;
const MAX_PAGE_SIZE = 100;
class ListUsersQueryDto {
    /** Free-text match on email or name. */
    q;
    role;
    page;
    pageSize;
}
exports.ListUsersQueryDto = ListUsersQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(MAX_SEARCH),
    __metadata("design:type", String)
], ListUsersQueryDto.prototype, "q", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['ADMIN', 'USER']),
    __metadata("design:type", String)
], ListUsersQueryDto.prototype, "role", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ListUsersQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(MAX_PAGE_SIZE),
    __metadata("design:type", Number)
], ListUsersQueryDto.prototype, "pageSize", void 0);
class UpdateUserRoleDto {
    role;
}
exports.UpdateUserRoleDto = UpdateUserRoleDto;
__decorate([
    (0, class_validator_1.IsIn)(['ADMIN', 'USER']),
    __metadata("design:type", String)
], UpdateUserRoleDto.prototype, "role", void 0);
//# sourceMappingURL=admin-user.dto.js.map