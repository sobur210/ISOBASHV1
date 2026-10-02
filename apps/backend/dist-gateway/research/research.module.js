"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResearchModule = void 0;
const common_1 = require("@nestjs/common");
const ai_module_1 = require("../ai/ai.module");
const auth_module_1 = require("../auth/auth.module");
const memory_module_1 = require("../memory/memory.module");
const security_module_1 = require("../security/security.module");
const config_module_1 = require("../shared/config/config.module");
const research_controller_1 = require("./research.controller");
const research_service_1 = require("./research.service");
const search_service_1 = require("./search.service");
const web_retrieval_service_1 = require("./web-retrieval.service");
let ResearchModule = class ResearchModule {
};
exports.ResearchModule = ResearchModule;
exports.ResearchModule = ResearchModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, ai_module_1.AiModule, config_module_1.ConfigModule, memory_module_1.MemoryModule, security_module_1.SecurityModule],
        controllers: [research_controller_1.ResearchController],
        providers: [research_service_1.ResearchService, search_service_1.SearchService, web_retrieval_service_1.WebRetrievalService],
        exports: [research_service_1.ResearchService, web_retrieval_service_1.WebRetrievalService],
    })
], ResearchModule);
//# sourceMappingURL=research.module.js.map