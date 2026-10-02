"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolError = void 0;
class ToolError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'ToolError';
    }
}
exports.ToolError = ToolError;
//# sourceMappingURL=tool.types.js.map