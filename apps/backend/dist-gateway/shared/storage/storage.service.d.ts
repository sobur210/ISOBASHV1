import { OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../config/configuration';
export type StorageKind = 'upload' | 'media' | 'temp' | 'logs' | 'cache' | 'knowledge';
export declare class StorageService implements OnModuleInit {
    private readonly config;
    private readonly logger;
    private roots;
    constructor(config: AppConfig);
    onModuleInit(): Promise<void>;
    root(kind: StorageKind): string;
    /**
     * Resolve a relative path inside a storage root. Paths that escape the root
     * (absolute paths, "..") are rejected to prevent traversal.
     */
    resolve(kind: StorageKind, relative: string): string;
    write(kind: StorageKind, relative: string, data: Buffer | string): Promise<string>;
    read(kind: StorageKind, relative: string): Promise<Buffer>;
    exists(kind: StorageKind, relative: string): Promise<boolean>;
    remove(kind: StorageKind, relative: string): Promise<void>;
    list(kind: StorageKind, relative?: string): Promise<string[]>;
}
