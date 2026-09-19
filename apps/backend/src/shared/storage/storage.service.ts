import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, resolve, isAbsolute, normalize, sep } from 'path';
import { InjectConfig } from '../config/inject-config';
import { AppConfig } from '../config/configuration';

export type StorageKind = 'upload' | 'media' | 'temp' | 'logs' | 'cache' | 'knowledge';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  private roots: Record<StorageKind, string>;

  constructor(@InjectConfig() private readonly config: AppConfig) {
    this.roots = {
      upload: config.storage.uploadRoot,
      media: config.storage.mediaRoot,
      temp: config.storage.tempRoot,
      logs: config.storage.logsRoot,
      cache: config.storage.cacheRoot,
      knowledge: config.storage.knowledgeRoot,
    };
  }

  async onModuleInit() {
    for (const [kind, root] of Object.entries(this.roots) as [StorageKind, string][]) {
      await fs.mkdir(root, { recursive: true });
      this.logger.log(`Storage ready: ${kind} -> ${root}`);
    }
  }

  root(kind: StorageKind): string {
    return this.roots[kind];
  }

  /**
   * Resolve a relative path inside a storage root. Paths that escape the root
   * (absolute paths, "..") are rejected to prevent traversal.
   */
  resolve(kind: StorageKind, relative: string): string {
    if (isAbsolute(relative)) {
      throw new Error(`Absolute paths are not allowed in storage resolution: ${relative}`);
    }
    const safe = normalize(relative).replace(/^([./])+/, '');
    if (safe.startsWith('..') || safe === '') {
      throw new Error(`Path escapes the ${kind} storage root: ${relative}`);
    }
    return resolve(join(this.roots[kind], safe));
  }

  async write(kind: StorageKind, relative: string, data: Buffer | string): Promise<string> {
    const target = this.resolve(kind, relative);
    const parent = target.slice(0, target.lastIndexOf(sep));
    await fs.mkdir(parent, { recursive: true });
    await fs.writeFile(target, data);
    return target;
  }

  async read(kind: StorageKind, relative: string): Promise<Buffer> {
    const target = this.resolve(kind, relative);
    return fs.readFile(target);
  }

  async exists(kind: StorageKind, relative: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(kind, relative));
      return true;
    } catch {
      return false;
    }
  }

  async remove(kind: StorageKind, relative: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(kind, relative));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async list(kind: StorageKind, relative = ''): Promise<string[]> {
    const target = this.resolve(kind, relative);
    return fs.readdir(target);
  }
}