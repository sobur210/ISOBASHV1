"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesModule = void 0;
const common_1 = require("@nestjs/common");
const ai_module_1 = require("../ai/ai.module");
const auth_module_1 = require("../auth/auth.module");
const billing_module_1 = require("../billing/billing.module");
const security_module_1 = require("../security/security.module");
const config_module_1 = require("../shared/config/config.module");
const storage_module_1 = require("../shared/storage/storage.module");
const document_extractor_service_1 = require("./document-extractor.service");
const embedding_service_1 = require("./embedding.service");
const file_processor_service_1 = require("./file-processor.service");
const files_controller_1 = require("./files.controller");
const files_service_1 = require("./files.service");
const knowledge_controller_1 = require("./knowledge.controller");
const knowledge_service_1 = require("./knowledge.service");
let FilesModule = class FilesModule {
};
exports.FilesModule = FilesModule;
exports.FilesModule = FilesModule = __decorate([
    (0, common_1.Module)({
        // RealtimeModule is @Global, so RealtimeService is available without importing it.
        imports: [auth_module_1.AuthModule, ai_module_1.AiModule, billing_module_1.BillingModule, config_module_1.ConfigModule, security_module_1.SecurityModule, storage_module_1.StorageModule],
        controllers: [files_controller_1.FilesController, knowledge_controller_1.KnowledgeController],
        providers: [files_service_1.FilesService, file_processor_service_1.FileProcessorService, document_extractor_service_1.DocumentExtractorService, embedding_service_1.EmbeddingService, knowledge_service_1.KnowledgeService],
        exports: [files_service_1.FilesService, knowledge_service_1.KnowledgeService, embedding_service_1.EmbeddingService],
    })
], FilesModule);
//# sourceMappingURL=files.module.js.map