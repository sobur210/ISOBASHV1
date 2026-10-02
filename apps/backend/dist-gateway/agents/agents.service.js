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
exports.AgentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const tools_registry_1 = require("../ai/tools.registry");
const strict_boolean_decorator_1 = require("../shared/dto/strict-boolean.decorator");
const MAX_TOOLS = 12;
let AgentsService = class AgentsService {
    prisma;
    tools;
    constructor(prisma, tools) {
        this.prisma = prisma;
        this.tools = tools;
    }
    list(userId) {
        return this.prisma.agent.findMany({
            where: { ownerId: userId },
            orderBy: { updatedAt: 'desc' },
            include: {
                project: { select: { id: true, name: true } },
                _count: { select: { runs: true, memories: true } },
            },
        });
    }
    async get(userId, id) {
        const agent = await this.prisma.agent.findFirst({
            where: { id, ownerId: userId },
            include: { project: { select: { id: true, name: true } } },
        });
        if (!agent) {
            throw new common_1.NotFoundException('Agent not found.');
        }
        return agent;
    }
    async create(userId, input) {
        const data = await this.normalise(userId, input);
        if (!data.name) {
            throw new common_1.BadRequestException('Agent name is required.');
        }
        return this.prisma.agent.create({ data: { ...data, name: data.name, ownerId: userId } });
    }
    async update(userId, id, input) {
        await this.get(userId, id);
        const data = await this.normalise(userId, input);
        return this.prisma.agent.update({ where: { id }, data });
    }
    async remove(userId, id) {
        await this.get(userId, id);
        await this.prisma.agent.delete({ where: { id } });
    }
    /**
     * Validation for create/update.
     *
     * Tool names are checked against the live registry, so an agent can never
     * reference a capability that does not exist, and `projectId` is verified
     * against the caller's own projects: a client cannot bind an agent to
     * somebody else's workspace by sending an id.
     */
    async normalise(userId, input) {
        const data = {};
        if (input.name !== undefined) {
            const name = input.name.trim();
            if (!name) {
                throw new common_1.BadRequestException('Agent name cannot be empty.');
            }
            data.name = name;
        }
        if (input.description !== undefined)
            data.description = input.description.trim() || null;
        if (input.instructions !== undefined)
            data.instructions = input.instructions.trim();
        if (input.providerModel !== undefined)
            data.providerModel = input.providerModel.trim() || null;
        if (input.maxSteps !== undefined)
            data.maxSteps = input.maxSteps;
        const memoryEnabled = (0, strict_boolean_decorator_1.strictBooleanValue)(input.memoryEnabled);
        if (memoryEnabled !== undefined)
            data.memoryEnabled = memoryEnabled;
        if (input.toolNames !== undefined) {
            const toolNames = [...new Set(input.toolNames.map((tool) => tool.trim()).filter(Boolean))];
            if (toolNames.length > MAX_TOOLS) {
                throw new common_1.BadRequestException(`An agent may enable at most ${MAX_TOOLS} tools.`);
            }
            const unknown = toolNames.filter((tool) => !this.tools.has(tool));
            if (unknown.length > 0) {
                throw new common_1.BadRequestException(`Unknown tool(s): ${unknown.join(', ')}.`);
            }
            data.toolNames = toolNames;
        }
        if (input.projectId !== undefined) {
            if (input.projectId === null) {
                data.projectId = null;
            }
            else {
                data.projectId = await this.requireOwnedProject(userId, input.projectId);
            }
        }
        return data;
    }
    async requireOwnedProject(userId, projectId) {
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, ownerId: userId },
            select: { id: true },
        });
        if (!project) {
            throw new common_1.BadRequestException('Project not found.');
        }
        return project.id;
    }
};
exports.AgentsService = AgentsService;
exports.AgentsService = AgentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        tools_registry_1.AiToolsRegistry])
], AgentsService);
//# sourceMappingURL=agents.service.js.map