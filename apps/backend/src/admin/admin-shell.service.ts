import { spawn } from 'child_process';

export type ShellCommandValidationResult = {
  allowed: boolean;
  command: string;
  normalized: string;
  tokens: string[];
  reason?: string;
};

export type ShellCommandExecutionResult = {
  ok: boolean;
  blocked: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  reason?: string;
};

const ALLOWED_BINARIES = new Set([
  'pwd',
  'ls',
  'dir',
  'whoami',
  'hostname',
  'date',
  'uname',
  'echo',
  'cat',
  'type',
  'node',
  'npm',
  'npx',
  'git',
  'ps',
  'Get-ChildItem',
  'Get-Process',
  'Get-Date',
]);

function resolveCommand(binary: string, args: string[]): { command: string; args: string[] } {
  const lower = binary.toLowerCase();

  if (lower === 'pwd') {
    return { command: process.execPath, args: ['-e', 'console.log(process.cwd())'] };
  }
  if (lower === 'ls' || lower === 'dir') {
    return {
      command: process.execPath,
      args: [
        '-e',
        "const fs=require('fs'); const path=require('path'); const entries=fs.readdirSync(process.cwd(),{withFileTypes:true}); console.log(entries.map(e=>path.join(e.name)).join('\n'));",
      ],
    };
  }
  if (lower === 'whoami') {
    return { command: process.execPath, args: ['-e', 'console.log(process.env.USERNAME || process.env.USER || process.platform)'] };
  }
  if (lower === 'hostname') {
    return { command: process.execPath, args: ['-e', 'console.log(require("os").hostname())'] };
  }
  if (lower === 'date') {
    return { command: process.execPath, args: ['-e', 'console.log(new Date().toString())'] };
  }
  if (lower === 'uname') {
    return { command: process.execPath, args: ['-e', 'console.log(process.platform)'] };
  }
  if (lower === 'echo') {
    return { command: process.execPath, args: ['-e', `console.log(${JSON.stringify(args.join(' '))})`] };
  }
  if (lower === 'cat') {
    const target = args[0] ?? '';
    return {
      command: process.execPath,
      args: [
        '-e',
        `const fs=require('fs'); const path=process.argv[1]; if(!path){process.exit(1);} console.log(fs.readFileSync(path,'utf8'));`,
        target,
      ],
    };
  }

  return { command: binary, args };
}

export class AdminShellService {
  private resolveExecutable(binary: string, args: string[]): { executable: string; args: string[] } {
    if (process.platform !== 'win32') {
      return { executable: binary, args };
    }

    if (binary === 'pwd') {
      return { executable: 'powershell', args: ['-NoLogo', '-NoProfile', '-Command', 'Get-Location'] };
    }

    if (binary === 'ls') {
      return { executable: 'cmd', args: ['/C', 'dir', ...args] };
    }

    if (binary === 'cat') {
      return { executable: 'cmd', args: ['/C', 'type', ...args] };
    }

    return { executable: binary, args };
  }

  validateCommand(raw: string): ShellCommandValidationResult {
    if (typeof raw !== 'string') {
      return { allowed: false, command: '', normalized: '', tokens: [], reason: 'Command is required.' };
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return { allowed: false, command: '', normalized: '', tokens: [], reason: 'Command is required.' };
    }

    if (/[;&|`$<>]/.test(trimmed)) {
      return {
        allowed: false,
        command: trimmed,
        normalized: trimmed,
        tokens: trimmed.split(/\s+/),
        reason: 'Shell chaining, pipes, redirects, and command substitution are blocked for safety.',
      };
    }

    const tokens = trimmed.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+/g) ?? [];
    if (tokens.length === 0) {
      return { allowed: false, command: trimmed, normalized: trimmed, tokens: [], reason: 'Command is empty.' };
    }

    const normalizedTokens = tokens.map((token) => token.replace(/^['"]|['"]$/g, ''));
    const [binary, ...rest] = normalizedTokens;
    if (!binary || !ALLOWED_BINARIES.has(binary)) {
      return {
        allowed: false,
        command: trimmed,
        normalized: normalizedTokens.join(' '),
        tokens: normalizedTokens,
        reason: `Command '${binary ?? 'unknown'}' is not allowed in the admin shell. Only read-only system diagnostics are permitted.`,
      };
    }

    const normalized = normalizedTokens.join(' ');
    return { allowed: true, command: trimmed, normalized, tokens: normalizedTokens };
  }

  async execute(raw: string): Promise<ShellCommandExecutionResult> {
    const validation = this.validateCommand(raw);
    if (!validation.allowed) {
      return {
        ok: false,
        blocked: true,
        command: validation.normalized || validation.command,
        stdout: '',
        stderr: validation.reason ?? 'Command is blocked.',
        exitCode: 1,
        reason: validation.reason,
      };
    }

    const [binary, ...args] = validation.tokens;
    const resolved = resolveCommand(binary, args);

    return new Promise((resolve) => {
      const child = spawn(resolved.command, resolved.args, {
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: 15_000,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error: Error) => {
        resolve({
          ok: false,
          blocked: false,
          command: validation.normalized,
          stdout,
          stderr: `${stderr}${error.message}`,
          exitCode: 1,
          reason: error.message,
        });
      });

      child.on('close', (code) => {
        resolve({
          ok: code === 0,
          blocked: false,
          command: validation.normalized,
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      });
    });
  }
}
