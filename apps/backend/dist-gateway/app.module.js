"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const health_controller_1 = require("./health.controller");
const health_service_1 = require("./health.service");
const prisma_module_1 = require("./prisma/prisma.module");
const queue_module_1 = require("./queues/queue.module");
const ai_module_1 = require("./ai/ai.module");
const chat_module_1 = require("./chat/chat.module");
const auth_module_1 = require("./auth/auth.module");
const admin_module_1 = require("./admin/admin.module");
const realtime_module_1 = require("./realtime/realtime.module");
const agents_module_1 = require("./agents/agents.module");
const research_module_1 = require("./research/research.module");
const files_module_1 = require("./files/files.module");
const media_module_1 = require("./media/media.module");
const video_assembly_module_1 = require("./media/video-assembly.module");
const memory_module_1 = require("./memory/memory.module");
const projects_module_1 = require("./projects/projects.module");
const billing_module_1 = require("./billing/billing.module");
const config_module_1 = require("./shared/config/config.module");
const configuration_1 = require("./shared/config/configuration");
const storage_module_1 = require("./shared/storage/storage.module");
const request_logging_middleware_1 = require("./shared/logging/request-logging.middleware");
const security_headers_middleware_1 = require("./security/security-headers.middleware");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(request_logging_middleware_1.RequestLoggingMiddleware, security_headers_middleware_1.SecurityHeadersMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: (0, configuration_1.resolveEnvFile)(),
            }),
            config_module_1.ConfigModule,
            storage_module_1.StorageModule,
            prisma_module_1.PrismaModule,
            queue_module_1.QueueModule,
            ai_module_1.AiModule,
            chat_module_1.ChatModule,
            auth_module_1.AuthModule,
            admin_module_1.AdminModule,
            realtime_module_1.RealtimeModule,
            memory_module_1.MemoryModule,
            projects_module_1.ProjectsModule,
            agents_module_1.AgentsModule,
            research_module_1.ResearchModule,
            files_module_1.FilesModule,
            media_module_1.MediaModule,
            billing_module_1.BillingModule,
            video_assembly_module_1.VideoAssemblyModule,
        ],
        controllers: [app_controller_1.AppController, health_controller_1.HealthController],
        providers: [
            app_service_1.AppService,
            health_service_1.HealthService,
            {
                provide: core_1.APP_PIPE,
                useValue: new common_1.ValidationPipe({
                    whitelist: true,
                    forbidNonWhitelisted: false,
                    transform: true,
                    transformOptions: { enableImplicitConversion: true },
                }),
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map