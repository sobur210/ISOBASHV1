"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaModule = void 0;
const common_1 = require("@nestjs/common");
const ai_module_1 = require("../ai/ai.module");
const auth_module_1 = require("../auth/auth.module");
const billing_module_1 = require("../billing/billing.module");
const security_module_1 = require("../security/security.module");
const queue_module_1 = require("../queues/queue.module");
const config_module_1 = require("../shared/config/config.module");
const storage_module_1 = require("../shared/storage/storage.module");
const image_generation_service_1 = require("./image-generation.service");
const media_controller_1 = require("./media.controller");
const media_service_1 = require("./media.service");
const prompt_composer_service_1 = require("./prompt-composer.service");
const video_generation_service_1 = require("./video-generation.service");
const video_render_queue_1 = require("./video-render.queue");
let MediaModule = class MediaModule {
};
exports.MediaModule = MediaModule;
exports.MediaModule = MediaModule = __decorate([
    (0, common_1.Module)({
        // RealtimeModule is @Global, so RealtimeService is available without importing it.
        imports: [auth_module_1.AuthModule, ai_module_1.AiModule, billing_module_1.BillingModule, config_module_1.ConfigModule, security_module_1.SecurityModule, storage_module_1.StorageModule, queue_module_1.QueueModule],
        controllers: [media_controller_1.MediaController],
        providers: [media_service_1.MediaService, image_generation_service_1.ImageGenerationService, video_generation_service_1.VideoGenerationService, prompt_composer_service_1.PromptComposerService, video_render_queue_1.VideoRenderQueue],
        exports: [media_service_1.MediaService, image_generation_service_1.ImageGenerationService, video_generation_service_1.VideoGenerationService],
    })
], MediaModule);
//# sourceMappingURL=media.module.js.map