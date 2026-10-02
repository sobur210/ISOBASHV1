import { describe, expect, it } from '@jest/globals';
import { AdminShellService } from './admin-shell.service';

describe('AdminShellService', () => {
  const service = new AdminShellService();
  const safeCommand = process.platform === 'win32' ? 'dir' : 'pwd';

  it('allows a minimal read-only command', () => {
    expect(service.validateCommand(safeCommand)).toMatchObject({ allowed: true, normalized: safeCommand });
  });

  it('blocks dangerous shell operators', () => {
    expect(service.validateCommand('rm -rf /')).toMatchObject({ allowed: false });
    expect(service.validateCommand('bash -lc "whoami"')).toMatchObject({ allowed: false });
  });

  it('executes a safe command and returns output', async () => {
    const result = await service.execute(safeCommand);
    expect(result.ok).toBe(true);
    expect(result.command).toBe(safeCommand);
    expect(typeof result.stdout).toBe('string');
  });
});
