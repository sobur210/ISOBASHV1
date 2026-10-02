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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ProjectsService = class ProjectsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    list(userId) {
        return this.prisma.project.findMany({
            where: { ownerId: userId },
            orderBy: { updatedAt: 'desc' },
            include: {
                tasks: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
                _count: { select: { agents: true, conversations: true, memories: true } },
            },
        });
    }
    async get(userId, id) {
        const project = await this.prisma.project.findFirst({
            where: { id, ownerId: userId },
            include: { tasks: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
        });
        if (!project) {
            throw new common_1.NotFoundException('Project not found.');
        }
        return project;
    }
    create(userId, input) {
        const name = input.name.trim();
        if (!name) {
            throw new common_1.BadRequestException('Project name cannot be empty.');
        }
        return this.prisma.project.create({
            data: { ownerId: userId, name, description: input.description?.trim() || null },
        });
    }
    async update(userId, id, input) {
        await this.get(userId, id);
        if (input.name !== undefined && !input.name.trim()) {
            throw new common_1.BadRequestException('Project name cannot be empty.');
        }
        return this.prisma.project.update({
            where: { id },
            data: {
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
            },
        });
    }
    async remove(userId, id) {
        await this.get(userId, id);
        await this.prisma.project.delete({ where: { id } });
    }
    async addTask(userId, projectId, input) {
        await this.get(userId, projectId);
        const title = input.title.trim();
        if (!title) {
            throw new common_1.BadRequestException('Task title cannot be empty.');
        }
        const last = await this.prisma.task.findFirst({
            where: { projectId },
            orderBy: { order: 'desc' },
            select: { order: true },
        });
        return this.prisma.task.create({
            data: {
                projectId,
                title,
                description: input.description?.trim() || null,
                order: (last?.order ?? 0) + 1,
            },
        });
    }
    /** Task ownership is checked through the project, never from the client. */
    async updateTask(userId, taskId, input) {
        const task = await this.ownedTask(userId, taskId);
        if (input.status && input.status === task.status) {
            throw new common_1.BadRequestException(`Task is already ${input.status.toLowerCase()}.`);
        }
        return this.prisma.task.update({
            where: { id: task.id },
            data: {
                ...(input.title !== undefined ? { title: input.title.trim() } : {}),
                ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
                ...(input.status !== undefined ? { status: input.status } : {}),
                ...(input.result !== undefined ? { result: input.result.trim() || null } : {}),
            },
        });
    }
    async removeTask(userId, taskId) {
        const task = await this.ownedTask(userId, taskId);
        await this.prisma.task.delete({ where: { id: task.id } });
    }
    async ownedTask(userId, taskId) {
        const task = await this.prisma.task.findFirst({
            where: { id: taskId, project: { ownerId: userId } },
            select: { id: true, projectId: true, status: true, title: true },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found.');
        }
        return task;
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProjectsService);
//# sourceMappingURL=projects.service.js.map