import { Injectable } from '@nestjs/common';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';
import { QueueService } from '../queues/queue.service';
import { AiProviderRegistry } from '../ai/provider.registry';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Phase 17 admin center: what this deployment is actually configured to do.
 *
 * Every value here is read from the live `AppConfig` the API booted with, and
 * every secret is reduced to a boolean. There is no endpoint that *writes*
 * configuration and no control that pretends to toggle a provider: every such
 * setting is environment-driven, so a toggle that changed a row would leave the
 * running process unchanged and be a lie. The response says so instead.
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    @InjectConfig() private readonly config: AppConfig,
    private readonly queues: QueueService,
    private readonly providers: AiProviderRegistry,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * A secret is reported as present or absent, never echoed. Even a partially
   * masked key is a credential fragment in an admin response body, and there is
   * no consumer of one.
   */
  private presence(value: string | undefined | null): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  async settings() {
    const [queues, workers] = await Promise.all([
      this.queues.getJobCounts().catch(() => null),
      this.queues.getWorkers().catch(() => null),
    ]);

    return {
      runtime: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        uptimeSeconds: Math.round(process.uptime()),
        apiUrl: this.config.apiUrl,
        webUrl: this.config.webUrl,
        corsOrigins: this.config.corsOrigins,
      },
      storage: {
        dataRoot: this.config.storage.dataRoot,
        uploadRoot: this.config.storage.uploadRoot,
        mediaRoot: this.config.storage.mediaRoot,
        tempRoot: this.config.storage.tempRoot,
        logsRoot: this.config.storage.logsRoot,
        cacheRoot: this.config.storage.cacheRoot,
        knowledgeRoot: this.config.storage.knowledgeRoot,
        modelRoot: this.config.storage.modelRoot,
        detail:
          'Absolute paths are shown to an administrator because they are what an operator has to change. They are not exposed on any user-facing route.',
      },
      providers: [
        {
          provider: 'ollama',
          enabled: this.config.ollama.enabled,
          baseUrl: this.config.ollama.baseUrl,
          model: this.config.ollama.model,
          embeddingModel: this.config.ollama.embeddingModel,
          credentialPresent: true,
          credentialKind: 'none (local)',
        },
        {
          provider: 'gemini',
          enabled: this.config.gemini.enabled,
          baseUrl: null,
          model: this.config.gemini.model,
          embeddingModel: this.config.gemini.embeddingModel,
          credentialPresent: this.presence(this.config.gemini.apiKey),
          credentialKind: 'API key',
        },
        {
          provider: 'openai',
          enabled: this.config.openai.enabled,
          baseUrl: this.config.openai.baseUrl,
          model: this.config.openai.model,
          embeddingModel: this.config.openai.embeddingModel,
          credentialPresent: this.presence(this.config.openai.apiKey),
          credentialKind: 'API key',
        },
      ],
      registeredProviders: this.providers.names(),
      limits: {
        files: {
          maxBytes: this.config.files.maxBytes,
          maxFilesPerUser: this.config.files.maxFilesPerUser,
          maxTotalBytesPerUser: this.config.files.maxTotalBytesPerUser,
          chunkSize: this.config.files.chunkSize,
          maxChunksPerFile: this.config.files.maxChunksPerFile,
          minVectorSimilarity: this.config.files.minVectorSimilarity,
        },
        media: {
          maxPromptCharacters: this.config.media.maxPromptCharacters,
          maxImagesPerRequest: this.config.media.maxImagesPerRequest,
          maxAssetsPerUser: this.config.media.maxAssetsPerUser,
          maxTotalBytesPerUser: this.config.media.maxTotalBytesPerUser,
          maxImageBytes: this.config.media.maxImageBytes,
          aspectRatios: this.config.media.aspectRatios,
          generationsPerHour: this.config.media.generationsPerHour,
        },
        research: {
          maxSources: this.config.research.maxSources,
          maxCharactersPerSource: this.config.research.maxCharactersPerSource,
          fetchTimeoutMs: this.config.research.fetchTimeoutMs,
          searchConfigured: this.presence(this.config.research.braveApiKey),
        },
      },
      queues: {
        counts: queues,
        workers: workers ? workers.length : null,
        ready: this.queues.isReady(),
        detail: 'Counts are aggregated over every queue this process has touched.',
      },
      writable: false,
      detail:
        'Configuration is environment-driven and read at startup. This endpoint is read-only by design: a control that wrote a row would report a change the running process had not applied. Edit the environment and restart the service to change anything here.',
    };
  }

  /** Counts across the tables the admin overview shows, each a real aggregate. */
  async overview() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      users,
      admins,
      activeSessions,
      newUsersToday,
      agents,
      agentRuns,
      projects,
      conversations,
      messages,
      files,
      mediaAssets,
      researchSessions,
      auditLast24h,
      auditLast7d,
      planCounts,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'ADMIN' } }),
      this.prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      this.prisma.agent.count(),
      this.prisma.agentRun.count(),
      this.prisma.project.count(),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.storedFile.count(),
      this.prisma.mediaAsset.count(),
      this.prisma.researchSession.count(),
      this.prisma.auditEvent.count({ where: { createdAt: { gte: dayAgo } } }),
      this.prisma.auditEvent.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.subscription.groupBy({ by: ['plan'], _count: { _all: true } }),
    ]);

    const subscriptions = new Map(planCounts.map((row) => [row.plan, row._count._all]));
    const onPro = subscriptions.get('PRO') ?? 0;

    return {
      generatedAt: now.toISOString(),
      accounts: {
        total: users,
        admins,
        onFree: users - onPro,
        onPro,
        activeSessions,
        registeredLast24h: newUsersToday,
      },
      content: {
        projects,
        conversations,
        messages,
        agents,
        agentRuns,
        researchSessions,
        files,
        mediaAssets,
      },
      audit: { last24h: auditLast24h, last7d: auditLast7d },
      detail:
        'Every count is a live aggregate over the same tables the product surfaces read, so the admin overview cannot disagree with the workspace. Accounts on Free are derived as total minus the accounts that hold a plan.',
    };
  }
}