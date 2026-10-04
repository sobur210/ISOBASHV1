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

  /**
   * `ls` and `dir` share one code path that rewrites the command into a node
   * script, and that rewrite is where an escaping bug once made every listing exit
   * 1 with an empty stdout on every platform. It is asserted here for both names
   * unconditionally: a suite that only ran the native binary (`dir` on Windows,
   * `pwd` on Linux) executed the broken branch on one platform only and passed on
   * the other, which is how it survived.
   */
  it.each(['ls', 'dir'])('lists the working directory with %s', async (binary) => {
    const result = await service.execute(binary);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  it('reads a file with cat', async () => {
    const result = await service.execute('cat jest.config.js');
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('testEnvironment');
  });
});
