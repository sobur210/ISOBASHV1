"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const app_module_1 = require("./app.module");
const configuration_1 = require("./shared/config/configuration");
async function bootstrap() {
    const config = (0, configuration_1.loadConfig)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.use((0, cookie_parser_1.default)());
    // Credentials are allowed, so the allowed origins are an explicit list rather
    // than a reflected one. An unlisted origin is refused outright, and a request
    // that is allowed still gets the exact configured value back.
    const allowed = new Set(config.corsOrigins);
    app.enableCors({
        credentials: true,
        origin(origin, callback) {
            if (!origin) {
                callback(null, true);
                return;
            }
            callback(null, allowed.has(origin));
        },
    });
    app.enableShutdownHooks();
    await app.listen(config.port);
    const logger = new common_1.Logger('Bootstrap');
    logger.log(`ISOBASH API listening on ${config.apiUrl}`);
    logger.log(`CORS origins: ${config.corsOrigins.join(', ') || '(none)'}`);
    logger.log(`Runtime data root: ${config.storage.dataRoot}`);
}
bootstrap();
//# sourceMappingURL=main.js.map