"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const admin_shell_service_1 = require("./admin-shell.service");
(0, globals_1.describe)('AdminShellService', () => {
    const service = new admin_shell_service_1.AdminShellService();
    const safeCommand = process.platform === 'win32' ? 'dir' : 'pwd';
    (0, globals_1.it)('allows a minimal read-only command', () => {
        (0, globals_1.expect)(service.validateCommand(safeCommand)).toMatchObject({ allowed: true, normalized: safeCommand });
    });
    (0, globals_1.it)('blocks dangerous shell operators', () => {
        (0, globals_1.expect)(service.validateCommand('rm -rf /')).toMatchObject({ allowed: false });
        (0, globals_1.expect)(service.validateCommand('bash -lc "whoami"')).toMatchObject({ allowed: false });
    });
    (0, globals_1.it)('executes a safe command and returns output', async () => {
        const result = await service.execute(safeCommand);
        (0, globals_1.expect)(result.ok).toBe(true);
        (0, globals_1.expect)(result.command).toBe(safeCommand);
        (0, globals_1.expect)(typeof result.stdout).toBe('string');
    });
});
//# sourceMappingURL=admin-shell.service.test.js.map