import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiToolsRegistry } from '../ai/tools.registry';
import { strictBooleanValue } from '../shared/dto/strict-boolean.decorator';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';

const MAX_TOOLS = 12;

type AgentWriteData = {
  name?: string;
  description?: string | null;
  instructions?: string;
  providerModel?: string | null;
  maxSteps?: number;
  toolNames?: string[];
  memoryEnabled?: boolean;
  projectId?: number | null;
};

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: AiToolsRegistry,
  ) {}

  list(userId: number) {
    return this.prisma.agent.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { runs: true, memories: true } },
      },
    });
  }

  async get(userId: number, id: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id, ownerId: userId },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }
    return agent;
  }

  async create(userId: number, input: CreateAgentDto) {
    const data = await this.normalise(userId, input);
    if (!data.name) {
      throw new BadRequestException('Agent name is required.');
    }
    return this.prisma.agent.create({ data: { ...data, name: data.name, ownerId: userId } });
  }

  async update(userId: number, id: string, input: UpdateAgentDto) {
    await this.get(userId, id);
    const data = await this.normalise(userId, input);
    return this.prisma.agent.update({ where: { id }, data });
  }

  async remove(userId: number, id: string) {
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
  private async normalise(userId: number, input: CreateAgentDto | UpdateAgentDto): Promise<AgentWriteData> {
    const data: AgentWriteData = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new BadRequestException('Agent name cannot be empty.');
      }
      data.name = name;
    }

    if (input.description !== undefined) data.description = input.description.trim() || null;
    if (input.instructions !== undefined) data.instructions = input.instructions.trim();
    if (input.providerModel !== undefined) data.providerModel = input.providerModel.trim() || null;
    if (input.maxSteps !== undefined) data.maxSteps = input.maxSteps;
    const memoryEnabled = strictBooleanValue(input.memoryEnabled);
    if (memoryEnabled !== undefined) data.memoryEnabled = memoryEnabled;

    if (input.toolNames !== undefined) {
      const toolNames = [...new Set(input.toolNames.map((tool) => tool.trim()).filter(Boolean))];
      if (toolNames.length > MAX_TOOLS) {
        throw new BadRequestException(`An agent may enable at most ${MAX_TOOLS} tools.`);
      }
      const unknown = toolNames.filter((tool) => !this.tools.has(tool));
      if (unknown.length > 0) {
        throw new BadRequestException(`Unknown tool(s): ${unknown.join(', ')}.`);
      }
      data.toolNames = toolNames;
    }

    if (input.projectId !== undefined) {
      if (input.projectId === null) {
        data.projectId = null;
      } else {
        data.projectId = await this.requireOwnedProject(userId, input.projectId);
      }
    }

    return data;
  }

  private async requireOwnedProject(userId: number, projectId: number): Promise<number> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestException('Project not found.');
    }
    return project.id;
  }
}
