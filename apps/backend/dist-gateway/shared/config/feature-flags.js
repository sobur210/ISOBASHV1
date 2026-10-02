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
exports.FeatureGuard = exports.RequireFeature = exports.FEATURE_KEY = void 0;
exports.featureEnabled = featureEnabled;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const inject_config_1 = require("./inject-config");
const api_error_1 = require("../errors/api-error");
exports.FEATURE_KEY = 'isobash_feature';
/** Require a feature on a controller or a single handler. */
const RequireFeature = (feature) => (0, common_1.SetMetadata)(exports.FEATURE_KEY, feature);
exports.RequireFeature = RequireFeature;
function featureEnabled(config, feature) {
    return config.features[feature];
}
/**
 * Reads the flag and, when it is off, throws the one structured answer every
 * disabled endpoint returns: 503 with `FEATURE_DISABLED` and the feature name,
 * so a client can tell "switched off" apart from "broken" or "not allowed".
 *
 * Admins pass regardless. A flag hides a surface from the people who use the
 * product; it must not lock the person who has to debug it out of the code
 * that is still running.
 */
let FeatureGuard = class FeatureGuard {
    reflector;
    config;
    constructor(reflector, config) {
        this.reflector = reflector;
        this.config = config;
    }
    canActivate(context) {
        const feature = this.reflector.getAllAndOverride(exports.FEATURE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!feature) {
            return true;
        }
        if (featureEnabled(this.config, feature)) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        if (request.user?.role === 'ADMIN') {
            return true;
        }
        throw new api_error_1.ApiError(`${feature} is currently disabled.`, 503, 'FEATURE_DISABLED', { feature, redirectTo: '/app' });
    }
};
exports.FeatureGuard = FeatureGuard;
exports.FeatureGuard = FeatureGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [core_1.Reflector, Object])
], FeatureGuard);
//# sourceMappingURL=feature-flags.js.map