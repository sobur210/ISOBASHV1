import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type MemoryScope = {
  userId: number;
  agentId?: string;
  projectId?: number;
};

const MAX_CONTENT = 2000;

@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(scope: MemoryScope, options: { query?: string; limit?: number } = {}) {
    return this.prisma.memoryEntry.findMany({
      where: {
        userId: scope.userId,
        ...(scope.agentId ? { agentId: scope.agentId } : {}),
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        ...(options.query ? { content: { contains: options.query, mode: 'insensitive' } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(options.limit ?? 50, 1), 200),
    });
  }

  async create(scope: MemoryScope, input: { content: string; kind?: 'FACT' | 'PREFERENCE' | 'SUMMARY' | 'NOTE'; source?: string; sourceId?: string }) {
    const content = input.content.trim();
    if (!content) {
      throw new BadRequestException('Memory content is required.');
    }
    if (content.length > MAX_CONTENT) {
      throw new BadRequestException(`Memory content exceeds ${MAX_CONTENT} characters.`);
    }
    return this.prisma.memoryEntry.create({
      data: {
        userId: scope.userId,
        agentId: scope.agentId ?? null,
        projectId: scope.projectId ?? null,
        content,
        kind: input.kind ?? 'NOTE',
        source: input.source ?? 'manual',
        sourceId: input.sourceId ?? null,
      },
    });
  }

  async remove(scope: MemoryScope, id: string) {
    const entry = await this.prisma.memoryEntry.findFirst({ where: { id, userId: scope.userId } });
    if (!entry) {
      throw new NotFoundException('Memory not found.');
    }
    await this.prisma.memoryEntry.delete({ where: { id } });
  }

  /** Most recent memories for prompt injection. Ordered by recency on purpose. */
  async recall(userId: number, limit = 8) {
    return this.prisma.memoryEntry.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, kind: true, content: true, updatedAt: true },
    });
  }

  async stats(userId: number) {
    const [total, byKind] = await Promise.all([
      this.prisma.memoryEntry.count({ where: { userId } }),
      this.prisma.memoryEntry.groupBy({ by: ['kind'], where: { userId }, _count: { _all: true } }),
    ]);
    return {
      total,
      byKind: Object.fromEntries(byKind.map((row) => [row.kind, row._count._all])),
    };
  }
}
