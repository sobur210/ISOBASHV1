import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, CreateTaskDto, UpdateProjectDto, UpdateTaskDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: number) {
    return this.prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        tasks: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { agents: true, conversations: true, memories: true } },
      },
    });
  }

  async get(userId: number, id: number) {
    const project = await this.prisma.project.findFirst({
      where: { id, ownerId: userId },
      include: { tasks: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!project) {
      throw new NotFoundException('Project not found.');
    }
    return project;
  }

  create(userId: number, input: CreateProjectDto) {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException('Project name cannot be empty.');
    }
    return this.prisma.project.create({
      data: { ownerId: userId, name, description: input.description?.trim() || null },
    });
  }

  async update(userId: number, id: number, input: UpdateProjectDto) {
    await this.get(userId, id);
    if (input.name !== undefined && !input.name.trim()) {
      throw new BadRequestException('Project name cannot be empty.');
    }
    return this.prisma.project.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
      },
    });
  }

  async remove(userId: number, id: number) {
    await this.get(userId, id);
    await this.prisma.project.delete({ where: { id } });
  }

  async addTask(userId: number, projectId: number, input: CreateTaskDto) {
    await this.get(userId, projectId);
    const title = input.title.trim();
    if (!title) {
      throw new BadRequestException('Task title cannot be empty.');
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
  async updateTask(userId: number, taskId: number, input: UpdateTaskDto) {
    const task = await this.ownedTask(userId, taskId);
    if (input.status && input.status === task.status) {
      throw new BadRequestException(`Task is already ${input.status.toLowerCase()}.`);
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

  async removeTask(userId: number, taskId: number) {
    const task = await this.ownedTask(userId, taskId);
    await this.prisma.task.delete({ where: { id: task.id } });
  }

  private async ownedTask(userId: number, taskId: number) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { ownerId: userId } },
      select: { id: true, projectId: true, status: true, title: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found.');
    }
    return task;
  }
}
