"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const inject_config_1 = require("../config/inject-config");
let StorageService = class StorageService {
    config;
    logger = new common_1.Logger('Storage');
    roots;
    constructor(config) {
        this.config = config;
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
        for (const [kind, root] of Object.entries(this.roots)) {
            await fs_1.promises.mkdir(root, { recursive: true });
            this.logger.log(`Storage ready: ${kind} -> ${root}`);
        }
    }
    root(kind) {
        return this.roots[kind];
    }
    /**
     * Resolve a relative path inside a storage root. Paths that escape the root
     * (absolute paths, "..") are rejected to prevent traversal.
     */
    resolve(kind, relative) {
        if ((0, path_1.isAbsolute)(relative)) {
            throw new Error(`Absolute paths are not allowed in storage resolution: ${relative}`);
        }
        const safe = (0, path_1.normalize)(relative).replace(/^([./])+/, '');
        if (safe.startsWith('..') || safe === '') {
            throw new Error(`Path escapes the ${kind} storage root: ${relative}`);
        }
        return (0, path_1.resolve)((0, path_1.join)(this.roots[kind], safe));
    }
    async write(kind, relative, data) {
        const target = this.resolve(kind, relative);
        const parent = target.slice(0, target.lastIndexOf(path_1.sep));
        await fs_1.promises.mkdir(parent, { recursive: true });
        await fs_1.promises.writeFile(target, data);
        return target;
    }
    async read(kind, relative) {
        const target = this.resolve(kind, relative);
        return fs_1.promises.readFile(target);
    }
    async exists(kind, relative) {
        try {
            await fs_1.promises.access(this.resolve(kind, relative));
            return true;
        }
        catch {
            return false;
        }
    }
    async remove(kind, relative) {
        try {
            await fs_1.promises.unlink(this.resolve(kind, relative));
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    async list(kind, relative = '') {
        const target = this.resolve(kind, relative);
        return fs_1.promises.readdir(target);
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [Object])
], StorageService);
//# sourceMappingURL=storage.service.js.map