"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InjectConfig = void 0;
const common_1 = require("@nestjs/common");
const config_module_1 = require("./config.module");
const InjectConfig = () => (0, common_1.Inject)(config_module_1.CONFIG);
exports.InjectConfig = InjectConfig;
//# sourceMappingURL=inject-config.js.map