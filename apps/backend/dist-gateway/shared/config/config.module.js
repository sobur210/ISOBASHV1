"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigModule = exports.CONFIG = void 0;
exports.loadConfiguredConfig = loadConfiguredConfig;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const configuration_1 = require("./configuration");
const all_exceptions_filter_1 = require("../errors/all-exceptions.filter");
exports.CONFIG = 'CONFIG';
function loadConfiguredConfig() {
    const config = (0, configuration_1.loadConfig)();
    (0, configuration_1.ensureStorageRoots)(config);
    return config;
}
let ConfigModule = class ConfigModule {
};
exports.ConfigModule = ConfigModule;
exports.ConfigModule = ConfigModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: exports.CONFIG,
                useFactory: loadConfiguredConfig,
            },
            { provide: core_1.APP_FILTER, useClass: all_exceptions_filter_1.AllExceptionsFilter },
        ],
        exports: [exports.CONFIG],
    })
], ConfigModule);
//# sourceMappingURL=config.module.js.map